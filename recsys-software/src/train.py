"""Pipeline training end-to-end: load -> clean -> features -> train -> save.

Jalankan: python -m src.train
"""
import json
import pickle
import random

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from .cleaning import clean_data
from .config import (ARTIFACT_DIR, BATCH_SIZE, BEST_MODEL_PATH, K_CORE,
                     LEARNING_RATE, N_EPOCHS, PATIENCE, SEED, TOP_K)
from .data_loading import load_raw_data
from .dataset import InteractionDataset
from .feature_engineering import (build_content_matrix, build_item_metadata,
                                  build_training_data, fit_encoders,
                                  temporal_split)
from .model import NeuMFHybrid


def set_seed(seed=SEED):
    """Set seed numpy, torch, dan random untuk reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def prepare_data():
    """Jalankan seluruh tahap data prep dan simpan artefaknya.

    Output: (train_final, content_tensor, n_users, n_items).
    """
    print("[1/4] Loading dataset ...")
    df = load_raw_data()
    print(f"  Baris mentah: {len(df):,}")

    print("[2/4] Cleaning (dropna teks + k-core) ...")
    df_clean = clean_data(df, k=K_CORE)
    print(f"  Baris bersih : {len(df_clean):,}")
    print(f"  User unik    : {df_clean['customer_id'].nunique():,}")
    print(f"  Produk unik  : {df_clean['product_parent'].nunique():,}")

    print("[3/4] Feature engineering ...")
    train_df, test_df = temporal_split(df_clean)
    train_df, test_df, user_encoder, item_encoder = fit_encoders(train_df, test_df)
    n_users, n_items = len(user_encoder.classes_), len(item_encoder.classes_)
    print(f"  Train: {len(train_df):,} | Test (setelah buang cold-start): {len(test_df):,}")

    item_metadata = build_item_metadata(df_clean, item_encoder)
    content_matrix, tfidf = build_content_matrix(item_metadata)
    train_final = build_training_data(train_df, n_items)
    print(f"  Data training (positif+negatif): {len(train_final):,}")

    print("[4/4] Menyimpan artefak data ...")
    ARTIFACT_DIR.mkdir(exist_ok=True)
    train_final.to_parquet(ARTIFACT_DIR / "train_final.parquet", index=False)
    train_df[["user_idx", "item_idx"]].to_parquet(
        ARTIFACT_DIR / "train_interactions.parquet", index=False
    )
    test_df[["user_idx", "item_idx", "star_rating"]].to_parquet(
        ARTIFACT_DIR / "test_final.parquet", index=False
    )
    item_metadata.to_parquet(ARTIFACT_DIR / "item_metadata.parquet", index=False)
    sp.save_npz(ARTIFACT_DIR / "item_content_matrix.npz", content_matrix)
    for name, obj in [("user_encoder", user_encoder),
                      ("item_encoder", item_encoder),
                      ("tfidf_vectorizer", tfidf)]:
        with open(ARTIFACT_DIR / f"{name}.pkl", "wb") as f:
            pickle.dump(obj, f)

    content_tensor = torch.tensor(content_matrix.toarray(), dtype=torch.float32)
    return train_final, content_tensor, n_users, n_items


def score_all_items(model, user_idx, n_items, device):
    """Skor logit model untuk satu user terhadap semua item."""
    users = torch.full((n_items,), user_idx, dtype=torch.long, device=device)
    items = torch.arange(n_items, dtype=torch.long, device=device)
    return model(users, items).cpu().numpy()


def compute_val_recall(model, val_pos, train_seen, n_items, device, k=TOP_K):
    """Recall@k rata-rata di validation set (positif val sebagai ground truth,
    item yang sudah dilihat user di train split dikecualikan dari ranking)."""
    model.eval()
    recalls = []
    with torch.no_grad():
        for user_idx, actual in val_pos.items():
            scores = score_all_items(model, user_idx, n_items, device)
            seen = train_seen.get(user_idx, set())
            if seen:
                scores[list(seen)] = -np.inf
            top = np.argpartition(-scores, k)[:k]
            recalls.append(len(set(top.tolist()) & actual) / len(actual))
    return float(np.mean(recalls))


def tune_alpha(model, val_pos, train_seen, pop_norm, n_items, device, k=TOP_K):
    """Grid search alpha (0.0..1.0 step 0.1) untuk ensemble
    alpha * sigmoid(neumf) + (1 - alpha) * popularity_norm,
    dinilai dengan Recall@k di validation set. Simpan ke ensemble_alpha.json."""
    model.eval()
    user_scores = {}
    with torch.no_grad():
        for user_idx in val_pos:
            logits = score_all_items(model, user_idx, n_items, device)
            probs = 1.0 / (1.0 + np.exp(-logits))
            user_scores[user_idx] = probs

    results = []
    for alpha in np.round(np.arange(0.0, 1.01, 0.1), 1):
        recalls = []
        for user_idx, actual in val_pos.items():
            final = alpha * user_scores[user_idx] + (1 - alpha) * pop_norm
            seen = train_seen.get(user_idx, set())
            if seen:
                final = final.copy()
                final[list(seen)] = -np.inf
            top = np.argpartition(-final, k)[:k]
            recalls.append(len(set(top.tolist()) & actual) / len(actual))
        results.append({"alpha": float(alpha), "val_recall_at_10": float(np.mean(recalls))})
        print(f"  alpha={alpha:.1f} | val Recall@{k}: {np.mean(recalls):.4f}")

    best = max(results, key=lambda r: r["val_recall_at_10"])
    payload = {"alpha": best["alpha"], "val_recall_at_10": best["val_recall_at_10"],
               "grid": results}
    (ARTIFACT_DIR / "ensemble_alpha.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    print(f"Alpha terbaik: {best['alpha']} (val Recall@{k}: {best['val_recall_at_10']:.4f}) "
          f"-> artifacts/ensemble_alpha.json")
    return best["alpha"]


def train_model(train_final, content_tensor, n_users, n_items):
    """Latih NeuMF Hybrid dengan early stopping berbasis val Recall@10,
    simpan checkpoint dengan val Recall@10 tertinggi.

    Output: path checkpoint terbaik.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = NeuMFHybrid(n_users, n_items, content_tensor.shape[1], content_tensor).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Parameter trainable: {n_params:,}")

    train_split, val_split = train_test_split(
        train_final, test_size=0.1, random_state=SEED,
        stratify=train_final["label_implicit"],
    )
    train_loader = DataLoader(InteractionDataset(train_split),
                              batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(InteractionDataset(val_split),
                            batch_size=BATCH_SIZE, shuffle=False)

    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    # Ground truth ranking di validation: positif val per user; item yang
    # sudah dilihat user di train split dikecualikan dari kandidat ranking.
    val_pos = (val_split[val_split["label_implicit"] == 1]
               .groupby("user_idx")["item_idx"].apply(set).to_dict())
    train_seen = (train_split[train_split["label_implicit"] == 1]
                  .groupby("user_idx")["item_idx"].apply(set).to_dict())
    print(f"User validasi (punya positif): {len(val_pos):,}")

    best_val_recall = -1.0
    epochs_no_improve = 0
    history = []

    for epoch in range(1, N_EPOCHS + 1):
        model.train()
        total = 0.0
        for users, items, labels in train_loader:
            users, items, labels = users.to(device), items.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(users, items), labels)
            loss.backward()
            optimizer.step()
            total += loss.item() * len(users)
        train_loss = total / len(train_loader.dataset)

        model.eval()
        total = 0.0
        with torch.no_grad():
            for users, items, labels in val_loader:
                users, items, labels = users.to(device), items.to(device), labels.to(device)
                total += criterion(model(users, items), labels).item() * len(users)
        val_loss = total / len(val_loader.dataset)

        val_recall = compute_val_recall(model, val_pos, train_seen, n_items, device)
        history.append({"epoch": epoch, "train_loss": train_loss,
                        "val_loss": val_loss, "val_recall": val_recall})
        print(f"Epoch {epoch:>3} | train_loss: {train_loss:.4f} "
              f"| val_loss: {val_loss:.4f} | val Recall@{TOP_K}: {val_recall:.4f}")

        if val_recall > best_val_recall:
            best_val_recall = val_recall
            epochs_no_improve = 0
            torch.save(model.state_dict(), BEST_MODEL_PATH)
        else:
            epochs_no_improve += 1
        if epochs_no_improve >= PATIENCE:
            print(f"Early stopping di epoch {epoch} (patience {PATIENCE}).")
            break

    pd.DataFrame(history).to_csv(ARTIFACT_DIR / "training_history.csv", index=False)
    print(f"Best val Recall@{TOP_K}: {best_val_recall:.4f} | checkpoint: {BEST_MODEL_PATH}")

    # Grid search alpha ensemble di validation set memakai checkpoint terbaik.
    model.load_state_dict(torch.load(BEST_MODEL_PATH, map_location=device))
    pop_counts = np.zeros(n_items)
    train_pos = train_split[train_split["label_implicit"] == 1]
    counts = train_pos["item_idx"].value_counts()
    pop_counts[counts.index.to_numpy()] = counts.to_numpy()
    pop_norm = pop_counts / pop_counts.max()
    print("Grid search alpha ensemble (NeuMF + Popularity) ...")
    tune_alpha(model, val_pos, train_seen, pop_norm, n_items, device)
    return BEST_MODEL_PATH


def main():
    set_seed()
    train_final, content_tensor, n_users, n_items = prepare_data()
    train_model(train_final, content_tensor, n_users, n_items)


if __name__ == "__main__":
    main()
