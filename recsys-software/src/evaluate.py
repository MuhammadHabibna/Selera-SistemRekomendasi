"""Evaluasi ranking: NeuMF Hybrid vs Popularity Baseline.

Jalankan: python -m src.evaluate
"""
import json
import pickle

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch

from .config import ARTIFACT_DIR, BEST_MODEL_PATH, TOP_K
from .model import NeuMFHybrid

# Angka baseline dari notebook eksplorasi (WAJIB sebagai pembanding)
NOTEBOOK_BASELINE = {
    "Precision@10": 0.0058, "Recall@10": 0.044,
    "NDCG@10": 0.0204, "HitRate@10": 0.0563,
}


def precision_at_k(recommended, actual, k):
    """Proporsi item relevan di top-k rekomendasi."""
    return len(set(recommended[:k]) & actual) / k


def recall_at_k(recommended, actual, k):
    """Proporsi item relevan user yang tertangkap di top-k."""
    return len(set(recommended[:k]) & actual) / len(actual) if actual else 0.0


def ndcg_at_k(recommended, actual, k):
    """NDCG: hit di posisi atas dihargai lebih tinggi."""
    dcg = sum(1 / np.log2(i + 2) for i, it in enumerate(recommended[:k]) if it in actual)
    idcg = sum(1 / np.log2(i + 2) for i in range(min(len(actual), k)))
    return dcg / idcg if idcg > 0 else 0.0


def hit_rate_at_k(recommended, actual, k):
    """1 jika minimal satu item relevan ada di top-k."""
    return 1.0 if set(recommended[:k]) & actual else 0.0


def evaluate_recommender(recommend_fn, test_df, k=TOP_K):
    """Rata-ratakan metrik ranking untuk semua user di test set.

    Input : fungsi (user_idx, k) -> list item_idx, test_df, k.
    Output: dict metrik.
    """
    test_user_items = test_df.groupby("user_idx")["item_idx"].apply(set).to_dict()
    p, r, n, h = [], [], [], []
    for user_idx, actual in test_user_items.items():
        rec = recommend_fn(user_idx, k)
        p.append(precision_at_k(rec, actual, k))
        r.append(recall_at_k(rec, actual, k))
        n.append(ndcg_at_k(rec, actual, k))
        h.append(hit_rate_at_k(rec, actual, k))
    return {f"Precision@{k}": np.mean(p), f"Recall@{k}": np.mean(r),
            f"NDCG@{k}": np.mean(n), f"HitRate@{k}": np.mean(h)}


def load_artifacts():
    """Muat artefak data + model terlatih dari artifacts/."""
    train_inter = pd.read_parquet(ARTIFACT_DIR / "train_interactions.parquet")
    test_df = pd.read_parquet(ARTIFACT_DIR / "test_final.parquet")
    content = sp.load_npz(ARTIFACT_DIR / "item_content_matrix.npz")
    with open(ARTIFACT_DIR / "user_encoder.pkl", "rb") as f:
        user_encoder = pickle.load(f)
    with open(ARTIFACT_DIR / "item_encoder.pkl", "rb") as f:
        item_encoder = pickle.load(f)

    content_tensor = torch.tensor(content.toarray(), dtype=torch.float32)
    model = NeuMFHybrid(len(user_encoder.classes_), len(item_encoder.classes_),
                        content_tensor.shape[1], content_tensor)
    model.load_state_dict(torch.load(BEST_MODEL_PATH, map_location="cpu"))
    model.eval()
    return model, train_inter, test_df, len(item_encoder.classes_)


def main():
    model, train_inter, test_df, n_items = load_artifacts()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)

    user_seen = train_inter.groupby("user_idx")["item_idx"].apply(set).to_dict()
    popularity_rank = train_inter["item_idx"].value_counts().index.tolist()
    all_items = torch.arange(n_items, dtype=torch.long, device=device)

    def popularity_rec(user_idx, k):
        seen = user_seen.get(user_idx, set())
        return [i for i in popularity_rank if i not in seen][:k]

    def model_rec(user_idx, k):
        seen = user_seen.get(user_idx, set())
        with torch.no_grad():
            users = torch.full((n_items,), user_idx, dtype=torch.long, device=device)
            scores = model(users, all_items).cpu().numpy()
        if seen:
            scores[list(seen)] = -np.inf
        return np.argsort(-scores)[:k].tolist()

    # Ensemble: alpha * sigmoid(neumf) + (1 - alpha) * popularity_norm
    alpha = json.loads(
        (ARTIFACT_DIR / "ensemble_alpha.json").read_text(encoding="utf-8")
    )["alpha"]
    pop_counts = np.zeros(n_items)
    counts = train_inter["item_idx"].value_counts()
    pop_counts[counts.index.to_numpy()] = counts.to_numpy()
    pop_norm = pop_counts / pop_counts.max()

    def ensemble_rec(user_idx, k):
        seen = user_seen.get(user_idx, set())
        with torch.no_grad():
            users = torch.full((n_items,), user_idx, dtype=torch.long, device=device)
            logits = model(users, all_items).cpu().numpy()
        final = alpha * (1.0 / (1.0 + np.exp(-logits))) + (1 - alpha) * pop_norm
        if seen:
            final[list(seen)] = -np.inf
        return np.argsort(-final)[:k].tolist()

    print("Evaluasi Popularity Baseline ...")
    baseline = evaluate_recommender(popularity_rec, test_df)
    print("Evaluasi NeuMF Hybrid ...")
    neumf = evaluate_recommender(model_rec, test_df)
    print(f"Evaluasi NeuMF Hybrid + Popularity Ensemble (alpha={alpha}) ...")
    ensemble = evaluate_recommender(ensemble_rec, test_df)

    table = pd.DataFrame({
        "Popularity Baseline (notebook)": NOTEBOOK_BASELINE,
        "Popularity Baseline (repro)": baseline,
        "NeuMF Hybrid": neumf,
        "NeuMF Hybrid + Popularity Ensemble": ensemble,
    }).T.round(4)
    print()
    print(table)

    table.to_csv(ARTIFACT_DIR / "model_vs_baseline.csv")
    (ARTIFACT_DIR / "model_vs_baseline.md").write_text(
        "# Perbandingan Metrik: NeuMF Hybrid vs Popularity Baseline\n\n"
        + table.to_markdown() + "\n", encoding="utf-8"
    )
    print(f"\nTabel tersimpan di {ARTIFACT_DIR / 'model_vs_baseline.csv'} dan .md")


if __name__ == "__main__":
    main()
