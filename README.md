# PintarPilih — Sistem Rekomendasi

Sistem rekomendasi produk personal dengan penjelasan Generative AI (Google
Gemini) — submission IDCamp Challenge.

Live: https://pintarpilih.vercel.app

## Struktur

- `webapp/` — aplikasi Next.js + Supabase (deploy ke Vercel, Root Directory
  di-set ke folder ini). Setup lengkap: lihat `webapp/README.md`.
- `recsys-software/` — riset Fase 1 (Python/PyTorch): NeuMF Hybrid vs
  popularity baseline, batch export similarity/popularity ke Supabase.
- `docs/project_brief_draft.md` — project brief.

## Ringkasan arsitektur

Similarity konten antar produk dihitung offline (Python, TF-IDF cosine),
diimpor ke Supabase; personalisasi live dihitung di Next.js API route dari
riwayat like/rating/klik/view user; Gemini (gemini-3.1-flash-lite) memberi
penjelasan satu kalimat untuk rekomendasi teratas.

Dataset: publik Amazon Customer Reviews (kategori Software) sebagai
proof-of-concept — bukan data UMKM asli.
