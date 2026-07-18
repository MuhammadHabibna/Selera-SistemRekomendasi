"""Konfigurasi terpusat: path, seed, dan hyperparameter pipeline."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = PROJECT_ROOT / "data" / "raw" / "amazon_reviews_us_Software_v1_00.tsv"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts"

SEED = 42
K_CORE = 2
N_NEGATIVES = 4
TFIDF_MAX_FEATURES = 300
SPLIT_QUANTILE = 0.8

BATCH_SIZE = 512
N_EPOCHS = 30
PATIENCE = 5
LEARNING_RATE = 0.001
TOP_K = 10

BEST_MODEL_PATH = ARTIFACT_DIR / "neumf_hybrid_best.pt"
