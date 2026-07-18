"""Feature engineering: temporal split, encoding, TF-IDF content, negative sampling."""
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder

from .config import N_NEGATIVES, SEED, SPLIT_QUANTILE, TFIDF_MAX_FEATURES


def temporal_split(df, quantile=SPLIT_QUANTILE):
    """Split train/test berdasarkan quantile review_date (temporal, bukan random).

    Input : DataFrame bersih.
    Output: (train_df, test_df); test hanya berisi user & item yang dikenal
            di train (baris cold-start dibuang dari evaluasi).
    """
    split_date = df["review_date"].quantile(quantile)
    train_df = df[df["review_date"] <= split_date].copy()
    test_df = df[df["review_date"] > split_date].copy()

    known_users = set(train_df["customer_id"])
    known_items = set(train_df["product_parent"])
    test_df = test_df[
        test_df["customer_id"].isin(known_users)
        & test_df["product_parent"].isin(known_items)
    ].reset_index(drop=True)
    return train_df, test_df


def fit_encoders(train_df, test_df):
    """Fit LabelEncoder user/item HANYA dari train (mencegah leakage), lalu
    transform train dan test menjadi kolom user_idx / item_idx.

    Input : train_df, test_df.
    Output: (train_df, test_df, user_encoder, item_encoder).
    """
    user_encoder = LabelEncoder()
    item_encoder = LabelEncoder()
    train_df = train_df.assign(
        user_idx=user_encoder.fit_transform(train_df["customer_id"]),
        item_idx=item_encoder.fit_transform(train_df["product_parent"]),
    )
    test_df = test_df.assign(
        user_idx=user_encoder.transform(test_df["customer_id"]),
        item_idx=item_encoder.transform(test_df["product_parent"]),
    )
    return train_df, test_df, user_encoder, item_encoder


def build_item_metadata(df_clean, item_encoder):
    """Metadata produk (title, category) terurut sesuai item_idx.

    Input : DataFrame bersih penuh + item_encoder yang sudah di-fit.
    Output: DataFrame item_metadata dengan kolom product_parent, product_title,
            product_category, item_idx (baris ke-i = item_idx i).
    """
    meta = (
        df_clean[["product_parent", "product_title", "product_category"]]
        .drop_duplicates(subset="product_parent")
        .set_index("product_parent")
        .loc[item_encoder.classes_]
        .reset_index()
    )
    meta["item_idx"] = item_encoder.transform(meta["product_parent"])
    return meta.sort_values("item_idx").reset_index(drop=True)


def build_content_matrix(item_metadata, max_features=TFIDF_MAX_FEATURES):
    """TF-IDF dari product_title sebagai content embedding item.

    Input : item_metadata.
    Output: (sparse matrix [n_items x max_features], TfidfVectorizer terlatih).
    """
    tfidf = TfidfVectorizer(max_features=max_features, stop_words="english")
    matrix = tfidf.fit_transform(item_metadata["product_title"].fillna(""))
    return matrix, tfidf


def generate_negative_samples(train_df, n_items, n_negatives=N_NEGATIVES, seed=SEED):
    """Negative sampling: item yang belum pernah diinteraksi user diberi label 0.

    Input : train_df (dengan user_idx/item_idx), jumlah item, rasio negatif.
    Output: DataFrame [user_idx, item_idx, label_implicit=0].
    """
    rng = np.random.default_rng(seed)
    user_positive = train_df.groupby("user_idx")["item_idx"].apply(set).to_dict()

    neg_users, neg_items = [], []
    for user_idx, positives in user_positive.items():
        n_needed = len(positives) * n_negatives
        sampled = set()
        while len(sampled) < n_needed:
            candidate = int(rng.integers(0, n_items))
            if candidate not in positives:
                sampled.add(candidate)
        neg_users.extend([user_idx] * len(sampled))
        neg_items.extend(sampled)

    return pd.DataFrame(
        {"user_idx": neg_users, "item_idx": neg_items, "label_implicit": 0}
    )


def build_training_data(train_df, n_items, seed=SEED):
    """Gabungkan positif dan negatif menjadi data training final.

    Konvensi NCF: SEMUA interaksi yang ada = label 1 (berapapun ratingnya);
    hanya hasil negative sampling yang label 0.

    Input : train_df ter-encode, jumlah item.
    Output: DataFrame [user_idx, item_idx, label_implicit] teracak.
    """
    positives = train_df[["user_idx", "item_idx"]].assign(label_implicit=1)
    negatives = generate_negative_samples(train_df, n_items, seed=seed)
    combined = pd.concat([positives, negatives], ignore_index=True)
    return combined.sample(frac=1, random_state=seed).reset_index(drop=True)
