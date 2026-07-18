# Project Brief (Draf) — Selera: Sistem Rekomendasi Produk Personal

## Ringkasan

"Selera" adalah aplikasi web rekomendasi produk dengan akun sungguhan
(Supabase Auth). Rekomendasi tiap user berbeda dan berubah mengikuti apa yang
dia sukai, rating, klik, dan lihat — ditampilkan dalam antarmuka storefront
modern (baris-baris tematik ala platform streaming), dan dilengkapi penjelasan
berbahasa alami dari Generative AI (Google Gemini, model gemini-3.1-flash-lite)
untuk rekomendasi teratas.

## Kejujuran soal data (penting)

Model dan katalog dibangun dari **dataset publik Amazon Customer Reviews,
kategori Software** (~341 ribu review, ~90 ribu setelah pembersihan k-core;
7.222 produk) sebagai **proof-of-concept teknik rekomendasi — BUKAN data UMKM
asli**. Seluruh angka evaluasi di bawah mengacu ke dataset publik tersebut.

## Riset teknis Fase 1: NeuMF Hybrid vs baseline

Kami melatih model NeuMF Hybrid (GMF + MLP + cabang konten TF-IDF, PyTorch,
~2,27 juta parameter) dengan checkpoint dipilih berdasar val Recall@10, lalu
menambah ensemble popularitas (alpha=0.2 hasil grid search di validation set).
Hasil di test set temporal (20% terakhir):

| Model | Precision@10 | Recall@10 | NDCG@10 | HitRate@10 |
|---|---|---|---|---|
| Popularity Baseline | 0.0065 | 0.0513 | 0.0225 | 0.0637 |
| NeuMF Hybrid | 0.0050 | 0.0374 | 0.0185 | 0.0489 |
| NeuMF Hybrid + Popularity Ensemble | 0.0055 | 0.0416 | 0.0196 | 0.0533 |

Temuan jujur: pada dataset yang sangat sparse ini, sinyal kolaboratif NeuMF
belum mengungguli baseline popularitas; ensemble mempersempit gap tapi belum
melewatinya. Temuan ini yang mendasari keputusan arsitektur serving di bawah.

## Mesin rekomendasi live (yang benar-benar melayani akun)

NeuMF berbasis embedding hanya mengenal ~27 ribu user dataset dan tidak bisa
menghasilkan embedding untuk akun yang baru mendaftar (keterbatasan struktural
collaborative filtering, bukan bug). Karena itu serving TIDAK memanggil model
NeuMF/PyTorch secara live. Sebagai gantinya:

1. **Batch offline (Python, sekali):** cosine similarity TF-IDF antar produk
   (top-20 per item), metadata produk, dan ranking popularitas diekspor ke CSV
   lalu diimpor ke Supabase (Postgres).
2. **Personalisasi live (Next.js API route, murni SQL/JS):** skor kandidat =
   jumlah (similarity x bobot interaksi user). Bobot: rating memakai nilainya
   (1-5), like=3, klik=2, view=1, dikali faktor kebaruan (interaksi terbaru
   lebih berpengaruh); item yang sudah diinteraksi dikecualikan; dihitung
   ulang setiap halaman rekomendasi dibuka.
3. **Onboarding preference elicitation:** user baru memilih minimal 3 produk
   yang menarik dari grid produk populer (multi-select) — tersimpan sebagai
   "like" sehingga rekomendasi pertamanya sudah personal. Tanpa interaksi
   sama sekali, fallback ke popularitas katalog.

## Pengalaman pengguna

Beranda menyajikan beberapa baris rekomendasi bertema, meniru pola storefront
modern: "Cocok dengan seleramu" (personal), "Karena kamu menyukai X" (item
serupa dengan favorit teratas user), "Populer di katalog", dan "Terakhir kamu
lihat". Halaman profil menampilkan riwayat sinyal (like/rating/klik/view)
agar transparan apa yang dipelajari sistem. Desain minimalis (font Inter,
satu aksen warna, animasi halus yang menghormati prefers-reduced-motion).

## Peran Generative AI

Rekomendasi teratas di baris "Cocok dengan seleramu" disertai penjelasan satu
kalimat dari Google Gemini berdasarkan produk yang disukai/dirating user
("kenapa produk ini untukmu"), membuat rekomendasi transparan. Penjelasan
dibatasi pada kartu teratas dan di-cache di sisi klien agar hemat kuota API —
keputusan desain sadar-biaya, bukan keterbatasan.

## Stack

Next.js App Router + Supabase (Postgres, Auth, RLS) + Google Gemini
(gemini-3.1-flash-lite); riset model: Python/PyTorch (repo recsys-software).
Deploy: Vercel.
