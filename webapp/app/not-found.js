import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container empty-state">
      <span className="eyebrow">404</span>
      <h1>Halaman tidak ditemukan</h1>
      <p className="subtitle">
        Halaman yang kamu tuju tidak ada atau sudah dipindahkan.
      </p>
      <Link href="/" className="btn primary">
        Kembali ke rekomendasi
      </Link>
    </div>
  );
}
