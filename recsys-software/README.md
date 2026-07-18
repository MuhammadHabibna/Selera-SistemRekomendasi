# RecSys Software — NeuMF Hybrid (IDCamp Challenge, Fase 1)

Sistem rekomendasi produk Software (dataset Amazon US Customer Reviews) dengan
model **NeuMF Hybrid** (GMF + MLP + content TF-IDF) di PyTorch, dibandingkan
terhadap baseline popularity.

## Setup

```bash
pip install -r requirements.txt
```

Letakkan dataset di: `data/raw/amazon_reviews_us_Software_v1_00.tsv`

## Cara Menjalankan

```bash
# 1. Data prep + training (load -> clean k-core -> features -> train + early stopping)
python -m src.train

# 2. Evaluasi: Precision/Recall/NDCG/HitRate@10, model vs baseline popularity
#    Hasil tersimpan di artifacts/model_vs_baseline.csv dan .md
python -m src.evaluate

# 3. Demo inference (user dikenal + cold-start)
python -m src.inference
```

## Pemakaian Inference

```python
from src.inference import get_recommendations

result = get_recommendations(user_id=12345678, top_n=10)
# user dikenal  -> strategy "neumf_hybrid"
# user baru     -> strategy "content_based_cold_start" (fallback TF-IDF, tidak error)
```

## Struktur

- `src/data_loading.py` — baca TSV (`quoting=3` wajib)
- `src/cleaning.py` — dropna teks + iterative k-core filtering (k=2)
- `src/feature_engineering.py` — temporal split (quantile 0.8), label encoding
  (fit hanya dari train), TF-IDF 300 dim, negative sampling 1:4
- `src/dataset.py` — PyTorch `InteractionDataset`
- `src/model.py` — `NeuMFHybrid` (3 cabang + fusion)
- `src/train.py` — pipeline training end-to-end, checkpoint terbaik
- `src/evaluate.py` — metrik ranking @10 vs baseline
- `src/inference.py` — `get_recommendations(user_id, top_n)`
- `artifacts/` — model, encoder, TF-IDF vectorizer, tabel perbandingan

## Keputusan Desain

- Label implisit: semua interaksi = 1, hanya negative sample = 0 (konvensi NCF).
- Split temporal, bukan random; baris test cold-start dibuang dari evaluasi.
- Seed 42 di numpy/torch/random dan seluruh proses split.
