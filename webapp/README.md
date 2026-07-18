# PintarPilih — Rekomendasi Produk (Fase 2)

Live: https://pintarpilih.vercel.app

Aplikasi Next.js + Supabase + Gemini di atas hasil riset rekomendasi Fase 1
(`../recsys-software`). Personalisasi live dihitung dari tabel
`item_similarity` (content-based, hasil batch Python) + riwayat interaksi
nyata user — tanpa server Python live.

## Setup

### 1. Batch export dari Fase 1 (sudah dijalankan sekali)

```bash
cd ../recsys-software
python -m src.export_for_supabase
```

Menghasilkan `recsys-software/export/`: `items.csv`, `item_similarity.csv`,
`item_popularity.csv` (+ `model_vs_baseline.csv` sebagai referensi riset,
tidak diimpor).

### 2. Proyek Supabase

1. Buat proyek di https://supabase.com.
2. Jalankan `supabase/migrations/001_init.sql` di **SQL Editor** dashboard
   (atau `supabase db push` kalau memakai Supabase CLI).
3. **Auth**: buka Authentication > Providers > Email, aktifkan Email/Password,
   dan **matikan "Confirm email"** supaya demo daftar-langsung-masuk lancar.

### 3. Impor CSV

**Cara yang disarankan — script import** (importer CSV dashboard bisa gagal
parsial pada judul yang mengandung koma/kutip, memicu error foreign key):

1. Isi `.env.local` dengan `NEXT_PUBLIC_SUPABASE_URL` dan
   `SUPABASE_SERVICE_ROLE_KEY` (Settings > API > service_role).
2. Dari folder `webapp/`:

```bash
node scripts/import-csv.mjs
```

Script ini membersihkan sisa import parsial, meng-upsert per 1000 baris dengan
urutan aman foreign key (`items` dulu), lalu memverifikasi jumlah baris akhir
(harus: items 7.222, item_popularity 7.222, item_similarity 144.440).

**Alternatif lewat psql/Supabase CLI**:

```bash
psql "$SUPABASE_DB_URL" -c "\copy public.items from 'export/items.csv' csv header"
psql "$SUPABASE_DB_URL" -c "\copy public.item_popularity(item_idx,popularity_rank,popularity_score) from 'export/item_popularity.csv' csv header"
psql "$SUPABASE_DB_URL" -c "\copy public.item_similarity(item_idx,similar_item_idx,rank,similarity_score) from 'export/item_similarity.csv' csv header"
```

Catatan: urutan kolom CSV `item_popularity.csv` adalah
`item_idx,popularity_rank,popularity_score` — sama dengan urutan kolom tabel.
`user_interactions` TIDAK diimpor; terisi dari aktivitas user di aplikasi.

### 4. Jalankan aplikasi

```bash
cp .env.example .env.local   # isi URL + anon key Supabase + GEMINI_API_KEY
npm install
npm run dev
```

## Alur demo

1. Daftar akun baru -> onboarding preference elicitation (pilih pasangan
   produk, tersimpan sebagai `like`).
2. Halaman "Rekomendasi untukmu" langsung personal (bukan fallback
   popularitas), tiap kartu diberi penjelasan satu kalimat dari Gemini.
3. Jelajah Produk: cari, klik, suka, rating — semua tercatat ke
   `user_interactions`.
4. Like/rating produk baru lalu refresh halaman rekomendasi -> daftar berubah.

## Arsitektur singkat

- `app/api/recommendations` — skor = jumlah(similarity x bobot interaksi);
  bobot: rate=nilai rating, like=3, click=2, view=1, dikali faktor recency;
  user tanpa interaksi mendapat top popularitas.
- `app/api/interactions` — validasi + insert interaksi (RLS: hanya milik
  sendiri).
- `app/api/explain` — Google Gemini, satu kalimat alasan rekomendasi
  berbahasa Indonesia; punya fallback non-AI kalau API gagal.

## Deploy ke Vercel

1. Push folder `webapp/` ke repo GitHub, import di vercel.com.
2. Environment Variables di Vercel (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-3.1-flash-lite`
   - JANGAN tambahkan `SUPABASE_SERVICE_ROLE_KEY` (hanya untuk script import
     lokal).
3. Di Supabase: Authentication > URL Configuration > set **Site URL** ke
   `https://<project>.vercel.app` dan tambahkan URL yang sama di **Redirect
   URLs**.
4. Penjelasan Gemini hanya dipanggil untuk 3 kartu teratas dan di-cache di
   browser (7 hari) supaya hemat kuota free tier.
