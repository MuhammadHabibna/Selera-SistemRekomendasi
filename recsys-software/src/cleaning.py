"""Cleaning: drop missing text dan iterative k-core filtering."""


def drop_missing_text(df):
    """Buang baris tanpa product_title / review_body / review_headline.

    Input : DataFrame mentah.
    Output: DataFrame tanpa missing pada kolom teks penting.
    """
    return df.dropna(
        subset=["product_title", "review_body", "review_headline"]
    ).reset_index(drop=True)


def k_core_filter(df, user_col="customer_id", item_col="product_parent", k=2):
    """Iterative k-core: pertahankan hanya user dan item dengan >= k interaksi.

    Input : DataFrame interaksi, nama kolom user/item, threshold k.
    Output: DataFrame terfilter (index di-reset).
    """
    data = df
    while True:
        user_counts = data[user_col].value_counts()
        item_counts = data[item_col].value_counts()
        valid_users = user_counts[user_counts >= k].index
        valid_items = item_counts[item_counts >= k].index
        filtered = data[
            data[user_col].isin(valid_users) & data[item_col].isin(valid_items)
        ]
        if len(filtered) == len(data):
            break
        data = filtered
    return data.reset_index(drop=True)


def clean_data(df, k=2):
    """Pipeline cleaning lengkap: drop missing text -> is_vine -> k-core.

    Input : DataFrame mentah.
    Output: DataFrame bersih dengan kolom is_vine (0/1).
    """
    df = drop_missing_text(df)
    df = df.assign(is_vine=(df["vine"] == "Y").astype(int))
    return k_core_filter(df, k=k)
