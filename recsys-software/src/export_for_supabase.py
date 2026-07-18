"""Batch export artefak Fase 1 -> CSV untuk diimpor ke Supabase.

Dijalankan sekali (offline): python -m src.export_for_supabase
Output di folder export/: item_similarity.csv, items.csv, item_popularity.csv,
serta salinan metrik evaluasi Fase 1 sebagai referensi riset.
"""
import shutil

import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize

from .config import ARTIFACT_DIR, PROJECT_ROOT

EXPORT_DIR = PROJECT_ROOT / "export"
TOP_N_SIMILAR = 20
CHUNK_SIZE = 1000


def export_item_similarity(content_matrix):
    """Top-20 item paling mirip per item (cosine similarity TF-IDF).

    Output: DataFrame [item_idx, similar_item_idx, rank, similarity_score].
    """
    n_items = content_matrix.shape[0]
    normed = normalize(content_matrix)
    rows = []
    for start in range(0, n_items, CHUNK_SIZE):
        end = min(start + CHUNK_SIZE, n_items)
        sims = cosine_similarity(normed[start:end], normed)
        for i in range(end - start):
            item_idx = start + i
            row = sims[i]
            row[item_idx] = -1.0  # item itu sendiri dikecualikan
            top = np.argpartition(-row, TOP_N_SIMILAR)[:TOP_N_SIMILAR]
            top = top[np.argsort(-row[top])]
            for rank, sim_idx in enumerate(top, start=1):
                rows.append((item_idx, int(sim_idx), rank, float(row[sim_idx])))
    return pd.DataFrame(
        rows, columns=["item_idx", "similar_item_idx", "rank", "similarity_score"]
    )


def export_item_popularity(train_inter, n_items):
    """Ranking popularitas dari jumlah interaksi train Fase 1.

    Output: DataFrame [item_idx, popularity_rank, popularity_score] — score
    dinormalisasi [0,1]; item tanpa interaksi dapat score 0 dan rank terbawah.
    """
    counts = train_inter["item_idx"].value_counts()
    pop = pd.DataFrame({"item_idx": range(n_items)})
    pop["popularity_score"] = pop["item_idx"].map(counts).fillna(0.0)
    pop["popularity_score"] = pop["popularity_score"] / pop["popularity_score"].max()
    pop = pop.sort_values("popularity_score", ascending=False).reset_index(drop=True)
    pop["popularity_rank"] = pop.index + 1
    return pop[["item_idx", "popularity_rank", "popularity_score"]]


def main():
    EXPORT_DIR.mkdir(exist_ok=True)

    content = sp.load_npz(ARTIFACT_DIR / "item_content_matrix.npz")
    item_metadata = pd.read_parquet(ARTIFACT_DIR / "item_metadata.parquet")
    train_inter = pd.read_parquet(ARTIFACT_DIR / "train_interactions.parquet")

    print("[1/4] Menghitung item-item content similarity (top-20) ...")
    sim_df = export_item_similarity(content)
    sim_df.to_csv(EXPORT_DIR / "item_similarity.csv", index=False)
    print(f"  {len(sim_df):,} baris -> export/item_similarity.csv")

    print("[2/4] Mengekspor metadata produk ...")
    items = item_metadata[["item_idx", "product_title", "product_category"]]
    items.to_csv(EXPORT_DIR / "items.csv", index=False)
    print(f"  {len(items):,} baris -> export/items.csv")

    print("[3/4] Menghitung popularitas katalog ...")
    pop = export_item_popularity(train_inter, content.shape[0])
    pop.to_csv(EXPORT_DIR / "item_popularity.csv", index=False)
    print(f"  {len(pop):,} baris -> export/item_popularity.csv")

    print("[4/4] Menyalin metrik evaluasi Fase 1 (referensi riset) ...")
    shutil.copy(ARTIFACT_DIR / "model_vs_baseline.csv",
                EXPORT_DIR / "model_vs_baseline.csv")
    print("Selesai. Semua CSV ada di folder export/.")


if __name__ == "__main__":
    main()
