// Kategori minat diturunkan dari kata kunci judul produk — kolom
// product_category dataset Amazon Software seragam, jadi "genre" praktisnya
// ada di judul (TurboTax, Norton, Photoshop, Windows, dst).
export const GENRES = [
  {
    id: "keamanan",
    label: "Keamanan & Antivirus",
    re: /norton|antivirus|anti-virus|security|kaspersky|mcafee|bitdefender|firewall|360/i,
  },
  {
    id: "keuangan",
    label: "Keuangan & Pajak",
    re: /turbotax|turbo tax|tax|quicken|quickbooks|h&r block|money|accounting|finance/i,
  },
  {
    id: "desain",
    label: "Desain, Foto & Video",
    re: /photoshop|premiere|paintshop|photo|corel|illustrator|elements|video|drawing|studio/i,
  },
  {
    id: "office",
    label: "Office & Produktivitas",
    re: /office|word|excel|powerpoint|works|pdf|document|outlook/i,
  },
  {
    id: "os",
    label: "Sistem Operasi",
    re: /windows|mac os|os x|snow leopard|linux|ubuntu/i,
  },
  {
    id: "edukasi",
    label: "Belajar & Bahasa",
    re: /rosetta|learn|teach|typing|instructor|tutor|kids|language|spanish|english|math/i,
  },
];

// Tipe pengguna -> genre tambahan yang relevan.
export const USER_TYPES = [
  { id: "pelajar", label: "Pelajar / Mahasiswa", desc: "Belajar, tugas, dan produktivitas", genres: ["edukasi", "office"] },
  { id: "profesional", label: "Profesional / Pebisnis", desc: "Kerja kantoran, keuangan, administrasi", genres: ["office", "keuangan"] },
  { id: "kreator", label: "Kreator / Desainer", desc: "Foto, video, dan karya visual", genres: ["desain"] },
  { id: "umum", label: "Pengguna Umum", desc: "Kebutuhan komputer sehari-hari", genres: ["os", "keamanan"] },
];

export function matchGenres(title, genreIds) {
  const t = title || "";
  return GENRES.some((g) => genreIds.includes(g.id) && g.re.test(t));
}
