// Import CSV export Fase 1 ke Supabase lewat API (lebih andal daripada
// upload CSV di dashboard, yang bisa gagal parsial pada judul berkoma/kutip).
//
// Cara pakai (dari folder webapp/):
//   1. Isi .env.local: NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
//      (Settings > API > service_role; JANGAN dipakai di frontend)
//   2. node scripts/import-csv.mjs
//
// Script ini idempotent: menghapus isi tabel katalog dulu (urutan aman FK),
// lalu upsert per batch 1000 baris.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const EXPORT_DIR = path.resolve(
  process.cwd(),
  "..",
  "recsys-software",
  "export"
);
const BATCH = 1000;

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Parser CSV standar (RFC 4180): tangani kutip ganda dan koma dalam field.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) =>
    Object.fromEntries(header.map((h, idx) => [h, r[idx]]))
  );
}

function readCsv(name) {
  const p = path.join(EXPORT_DIR, name);
  if (!existsSync(p)) {
    throw new Error(`File tidak ditemukan: ${p} — jalankan dulu "python -m src.export_for_supabase" di recsys-software/`);
  }
  return parseCsv(readFileSync(p, "utf-8"));
}

async function importTable(supabase, table, rows, mapRow, conflictKey) {
  console.log(`Import ${table}: ${rows.length.toLocaleString()} baris ...`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(mapRow);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictKey });
    if (error) {
      throw new Error(`Gagal di ${table} baris ${i}-${i + batch.length}: ${error.message}`);
    }
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  console.log(`\n  ${table} selesai.`);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local dulu."
    );
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const items = readCsv("items.csv");
  const popularity = readCsv("item_popularity.csv");
  const similarity = readCsv("item_similarity.csv");

  // Bersihkan sisa import parsial (urutan aman terhadap foreign key).
  console.log("Membersihkan tabel katalog (sisa import parsial) ...");
  for (const table of ["item_similarity", "item_popularity"]) {
    const { error } = await supabase.from(table).delete().gte("item_idx", 0);
    if (error) throw new Error(`Gagal bersihkan ${table}: ${error.message}`);
  }

  await importTable(
    supabase,
    "items",
    items,
    (r) => ({
      item_idx: Number(r.item_idx),
      product_title: r.product_title,
      product_category: r.product_category,
    }),
    "item_idx"
  );
  await importTable(
    supabase,
    "item_popularity",
    popularity,
    (r) => ({
      item_idx: Number(r.item_idx),
      popularity_rank: Number(r.popularity_rank),
      popularity_score: Number(r.popularity_score),
    }),
    "item_idx"
  );
  await importTable(
    supabase,
    "item_similarity",
    similarity,
    (r) => ({
      item_idx: Number(r.item_idx),
      similar_item_idx: Number(r.similar_item_idx),
      rank: Number(r.rank),
      similarity_score: Number(r.similarity_score),
    }),
    "item_idx,rank"
  );

  // Tabel opsional (migration 002): item_stats & item_assoc.
  try {
    const stats = readCsv("item_stats.csv");
    const assoc = readCsv("item_assoc.csv");
    await supabase.from("item_assoc").delete().gte("item_idx", 0);
    await importTable(
      supabase,
      "item_stats",
      stats,
      (r) => ({
        item_idx: Number(r.item_idx),
        avg_rating: Number(r.avg_rating),
        review_count: Number(r.review_count),
      }),
      "item_idx"
    );
    await importTable(
      supabase,
      "item_assoc",
      assoc,
      (r) => ({
        item_idx: Number(r.item_idx),
        assoc_item_idx: Number(r.assoc_item_idx),
        rank: Number(r.rank),
        support_count: Number(r.support_count),
        confidence: Number(r.confidence),
        lift: Number(r.lift),
      }),
      "item_idx,rank"
    );
  } catch (err) {
    console.warn(
      "Lewati item_stats/item_assoc (jalankan migration 002 dulu?):",
      err.message
    );
  }

  // Verifikasi jumlah baris akhir.
  for (const [table, expected] of [
    ["items", items.length],
    ["item_popularity", popularity.length],
    ["item_similarity", similarity.length],
  ]) {
    const { count, error } = await supabase
      .from(table)
      .select("item_idx", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    const ok = count === expected ? "OK" : `BEDA (harusnya ${expected})`;
    console.log(`Verifikasi ${table}: ${count} baris — ${ok}`);
  }
  console.log("Import selesai.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
