"""Inference: get_recommendations(user_id, top_n) siap pakai.

Jalankan contoh: python -m src.inference
"""
import json
import pickle
from functools import lru_cache

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from sklearn.metrics.pairwise import cosine_similarity

from .config import ARTIFACT_DIR, BEST_MODEL_PATH, TOP_K
from .model import NeuMFHybrid


@lru_cache(maxsize=1)
def _load():
    """Muat dan cache semua artefak inference (sekali per proses)."""
    with open(ARTIFACT_DIR / "user_encoder.pkl", "rb") as f:
        user_encoder = pickle.load(f)
    with open(ARTIFACT_DIR / "item_encoder.pkl", "rb") as f:
        item_encoder = pickle.load(f)
    item_metadata = pd.read_parquet(ARTIFACT_DIR / "item_metadata.parquet")
    train_inter = pd.read_parquet(ARTIFACT_DIR / "train_interactions.parquet")
    content = sp.load_npz(ARTIFACT_DIR / "item_content_matrix.npz")

    content_tensor = torch.tensor(content.toarray(), dtype=torch.float32)
    n_items = len(item_encoder.classes_)
    model = NeuMFHybrid(len(user_encoder.classes_), n_items,
                        content_tensor.shape[1], content_tensor)
    model.load_state_dict(torch.load(BEST_MODEL_PATH, map_location="cpu"))
    model.eval()

    # Skor popularitas ternormalisasi [0,1] + alpha ensemble hasil grid search
    counts = train_inter["item_idx"].value_counts()
    pop_norm = np.zeros(n_items)
    pop_norm[counts.index.to_numpy()] = counts.to_numpy()
    pop_norm = pop_norm / pop_norm.max()
    alpha_path = ARTIFACT_DIR / "ensemble_alpha.json"
    alpha = (json.loads(alpha_path.read_text(encoding="utf-8"))["alpha"]
             if alpha_path.exists() else 1.0)

    return {
        "user_encoder": user_encoder,
        "known_users": set(user_encoder.classes_),
        "item_metadata": item_metadata,
        "user_seen": train_inter.groupby("user_idx")["item_idx"].apply(set).to_dict(),
        "popularity_rank": train_inter["item_idx"].value_counts().index.tolist(),
        "content": content,
        "model": model,
        "n_items": n_items,
        "pop_norm": pop_norm,
        "alpha": alpha,
    }


def _to_products(item_indices, item_metadata):
    """Konversi list item_idx -> list dict produk (id, judul, kategori)."""
    rows = item_metadata.set_index("item_idx").loc[item_indices]
    return [
        {"product_parent": int(pp), "product_title": t, "product_category": c}
        for pp, t, c in zip(rows["product_parent"], rows["product_title"],
                            rows["product_category"])
    ]


def get_recommendations(user_id, top_n=TOP_K):
    """Rekomendasi top-n produk untuk seorang user.

    - User dikenal (ada di encoder): ranking oleh ensemble
      alpha * sigmoid(NeuMF) + (1 - alpha) * popularitas ternormalisasi
      (alpha hasil grid search di validation set, artifacts/ensemble_alpha.json);
      produk yang sudah pernah diinteraksi user dikecualikan.
    - User tidak dikenal (cold-start): fallback content-based — item populer
      teratas dijadikan anchor, lalu item paling mirip secara TF-IDF
      (cosine similarity judul produk) direkomendasikan. Tidak error/crash.

    Input : user_id (customer_id asli), top_n.
    Output: dict {"user_id", "strategy", "recommendations": [produk...]}.
    """
    a = _load()

    if user_id in a["known_users"]:
        user_idx = int(a["user_encoder"].transform([user_id])[0])
        seen = a["user_seen"].get(user_idx, set())
        with torch.no_grad():
            users = torch.full((a["n_items"],), user_idx, dtype=torch.long)
            items = torch.arange(a["n_items"], dtype=torch.long)
            logits = a["model"](users, items).numpy()
        # Ensemble: alpha * sigmoid(neumf) + (1 - alpha) * popularity_norm
        neumf_score = 1.0 / (1.0 + np.exp(-logits))
        scores = a["alpha"] * neumf_score + (1 - a["alpha"]) * a["pop_norm"]
        if seen:
            scores[list(seen)] = -np.inf
        top = np.argsort(-scores)[:top_n].tolist()
        strategy = "neumf_popularity_ensemble"
    else:
        # Cold-start: anchor = item terpopuler, ranking = kemiripan konten
        anchor = a["popularity_rank"][0]
        sims = cosine_similarity(a["content"][anchor], a["content"]).ravel()
        sims[anchor] = np.inf  # anchor sendiri tetap direkomendasikan pertama
        top = np.argsort(-sims)[:top_n].tolist()
        strategy = "content_based_cold_start"

    return {
        "user_id": user_id,
        "strategy": strategy,
        "recommendations": _to_products(top, a["item_metadata"]),
    }


if __name__ == "__main__":
    a = _load()
    known_user = a["user_encoder"].classes_[0]
    for uid in [known_user, "USER_BARU_123"]:
        result = get_recommendations(uid, top_n=5)
        print(f"\nUser: {uid} | strategi: {result['strategy']}")
        for i, p in enumerate(result["recommendations"], 1):
            print(f"  {i}. {str(p['product_title'])[:70]}")
