"""Export tambahan untuk fitur web: statistik rating per item + association
rules (co-occurrence antar item dalam riwayat user yang sama).

Jalankan sekali: python -m src.export_assoc_stats
Output: export/item_stats.csv, export/item_assoc.csv
"""
from collections import Counter, defaultdict
from itertools import combinations

import pandas as pd

from .cleaning import clean_data
from .config import ARTIFACT_DIR, K_CORE, PROJECT_ROOT
from .data_loading import load_raw_data

EXPORT_DIR = PROJECT_ROOT / "export"
MIN_PAIR_SUPPORT = 3
TOP_RULES_PER_ITEM = 10


def export_item_stats(df_clean, item_encoder):
    """Rata-rata star_rating dan jumlah review per item (dari data bersih)."""
    known = set(item_encoder.classes_)
    df = df_clean[df_clean["product_parent"].isin(known)]
    stats = (
        df.groupby("product_parent")["star_rating"]
        .agg(avg_rating="mean", review_count="count")
        .reset_index()
    )
    stats["item_idx"] = item_encoder.transform(stats["product_parent"])
    stats["avg_rating"] = stats["avg_rating"].round(2)
    return stats[["item_idx", "avg_rating", "review_count"]].sort_values("item_idx")


def export_association_rules(train_inter):
    """Association rules dari co-occurrence item per user (train Fase 1).

    Untuk pasangan (a, b): confidence = n_ab / n_a, lift = confidence / (n_b/N).
    Simpan top-10 konsekuen per item (lift tertinggi), n_ab >= MIN_PAIR_SUPPORT.
    """
    baskets = train_inter.groupby("user_idx")["item_idx"].apply(set)
    n_users = len(baskets)
    item_count = Counter()
    pair_count = Counter()
    for items in baskets:
        for it in items:
            item_count[it] += 1
        for a, b in combinations(sorted(items), 2):
            pair_count[(a, b)] += 1

    rules = defaultdict(list)
    for (a, b), n_ab in pair_count.items():
        if n_ab < MIN_PAIR_SUPPORT:
            continue
        for ante, cons in ((a, b), (b, a)):
            confidence = n_ab / item_count[ante]
            lift = confidence / (item_count[cons] / n_users)
            rules[ante].append((cons, n_ab, confidence, lift))

    rows = []
    for ante, lst in rules.items():
        lst.sort(key=lambda r: (-r[3], -r[2]))
        for rank, (cons, n_ab, conf, lift) in enumerate(lst[:TOP_RULES_PER_ITEM], 1):
            rows.append((ante, cons, rank, n_ab, round(conf, 4), round(lift, 2)))
    return pd.DataFrame(
        rows,
        columns=["item_idx", "assoc_item_idx", "rank", "support_count",
                 "confidence", "lift"],
    )


def main():
    import pickle

    EXPORT_DIR.mkdir(exist_ok=True)
    with open(ARTIFACT_DIR / "item_encoder.pkl", "rb") as f:
        item_encoder = pickle.load(f)

    print("[1/2] Statistik rating per item ...")
    df_clean = clean_data(load_raw_data(), k=K_CORE)
    stats = export_item_stats(df_clean, item_encoder)
    stats.to_csv(EXPORT_DIR / "item_stats.csv", index=False)
    print(f"  {len(stats):,} baris -> export/item_stats.csv")

    print("[2/2] Association rules (co-occurrence) ...")
    train_inter = pd.read_parquet(ARTIFACT_DIR / "train_interactions.parquet")
    assoc = export_association_rules(train_inter)
    assoc.to_csv(EXPORT_DIR / "item_assoc.csv", index=False)
    print(f"  {len(assoc):,} aturan -> export/item_assoc.csv")


if __name__ == "__main__":
    main()
