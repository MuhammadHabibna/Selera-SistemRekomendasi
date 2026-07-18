"""Loading dataset Amazon Software Reviews dari file TSV."""
import pandas as pd

from .config import DATA_RAW


def load_raw_data(path=DATA_RAW):
    """Baca file TSV mentah.

    quoting=3 (QUOTE_NONE) wajib supaya tanda kutip di teks review
    tidak merusak parsing kolom. Baris rusak di-skip.

    Input : path file .tsv
    Output: DataFrame mentah, review_date sudah datetime (baris tanpa
            tanggal/rating valid dibuang).
    """
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset tidak ditemukan di {path}. "
            "Letakkan file .tsv di data/raw/ terlebih dahulu."
        )
    df = pd.read_csv(path, sep="\t", quoting=3, on_bad_lines="skip", low_memory=False)
    df["review_date"] = pd.to_datetime(df["review_date"], errors="coerce")
    return df.dropna(subset=["review_date", "star_rating"]).reset_index(drop=True)
