import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Bobot dasar per jenis interaksi; rate memakai nilai ratingnya sendiri.
const TYPE_WEIGHT = { view: 1, click: 2, like: 3 };
const ROW_SIZE = 12;
const MAX_SEEDS = 10;
const MAX_HISTORY = 300;

function interactionWeight(row, recencyIndex) {
  const base =
    row.interaction_type === "rate"
      ? row.rating_value ?? 3
      : TYPE_WEIGHT[row.interaction_type] ?? 1;
  // Interaksi lebih baru diberi bobot sedikit lebih besar (maks 2x).
  const recency = 1 + Math.exp(-recencyIndex / 10);
  return base * recency;
}

async function fetchPopular(supabase, excludeSet, limit) {
  const { data, error } = await supabase
    .from("item_popularity")
    .select("item_idx, popularity_score, items(product_title, product_category)")
    .order("popularity_rank", { ascending: true })
    .limit(limit + excludeSet.size);
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((p) => !excludeSet.has(p.item_idx))
    .slice(0, limit)
    .map((p) => ({
      item_idx: p.item_idx,
      score: p.popularity_score,
      product_title: p.items ? p.items.product_title : null,
      product_category: p.items ? p.items.product_category : null,
    }));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  try {
    const { data: inter, error } = await supabase
      .from("user_interactions")
      .select("item_idx, interaction_type, rating_value, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);
    if (error) throw new Error(error.message);

    // User baru tanpa interaksi: hanya baris populer.
    if (!inter || inter.length === 0) {
      const popular = await fetchPopular(supabase, new Set(), ROW_SIZE);
      return NextResponse.json({
        strategy: "popularity_cold_start",
        based_on: [],
        sections: [
          { id: "popular", title: "Populer di katalog", items: popular },
        ],
      });
    }

    // 1) Agregasi bobot per item (rate/like > click > view, plus recency).
    const seedScore = new Map();
    const seen = new Set();
    inter.forEach((row, i) => {
      seen.add(row.item_idx);
      const w = interactionWeight(row, i);
      seedScore.set(row.item_idx, (seedScore.get(row.item_idx) || 0) + w);
    });
    const seeds = [...seedScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SEEDS);
    const seedWeight = new Map(seeds);

    // 2) Item mirip dari item_similarity, skor = similarity * bobot seed.
    const { data: sims, error: simErr } = await supabase
      .from("item_similarity")
      .select("item_idx, similar_item_idx, similarity_score")
      .in("item_idx", seeds.map(([idx]) => idx));
    if (simErr) throw new Error(simErr.message);

    const candScore = new Map();
    for (const s of sims || []) {
      if (seen.has(s.similar_item_idx)) continue;
      const add = s.similarity_score * (seedWeight.get(s.item_idx) || 1);
      candScore.set(
        s.similar_item_idx,
        (candScore.get(s.similar_item_idx) || 0) + add
      );
    }
    const forYouIds = [...candScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, ROW_SIZE)
      .map(([idx]) => idx);

    // 3) Baris "karena kamu menyukai <seed teratas>".
    const topSeedIdx = seeds.length > 0 ? seeds[0][0] : null;
    const becauseIds = (sims || [])
      .filter((s) => s.item_idx === topSeedIdx && !seen.has(s.similar_item_idx))
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, ROW_SIZE)
      .map((s) => s.similar_item_idx);

    // 4) Riwayat terakhir (distinct, urutan terbaru).
    const recentIds = [...new Set(inter.map((r) => r.item_idx))].slice(0, ROW_SIZE);

    // 5) Populer keseluruhan (tanpa yang sudah dilihat).
    const popular = await fetchPopular(supabase, seen, ROW_SIZE);

    // Metadata untuk semua id yang dibutuhkan.
    const metaIds = [
      ...new Set([
        ...forYouIds,
        ...becauseIds,
        ...recentIds,
        ...seeds.map(([idx]) => idx),
      ]),
    ];
    const { data: meta, error: metaErr } = await supabase
      .from("items")
      .select("item_idx, product_title, product_category")
      .in("item_idx", metaIds);
    if (metaErr) throw new Error(metaErr.message);
    const metaMap = new Map((meta || []).map((m) => [m.item_idx, m]));
    const toItems = (ids) =>
      ids
        .map((idx) => metaMap.get(idx))
        .filter(Boolean)
        .map((m) => ({
          item_idx: m.item_idx,
          product_title: m.product_title,
          product_category: m.product_category,
        }));

    const based_on = seeds
      .slice(0, 3)
      .map(([idx]) => (metaMap.get(idx) ? metaMap.get(idx).product_title : null))
      .filter(Boolean);
    const topSeedTitle =
      topSeedIdx != null && metaMap.get(topSeedIdx)
        ? metaMap.get(topSeedIdx).product_title
        : null;

    const sections = [];
    if (forYouIds.length > 0) {
      sections.push({
        id: "for_you",
        title: "Cocok dengan seleramu",
        items: toItems(forYouIds),
      });
    }
    if (topSeedTitle && becauseIds.length > 0) {
      const shortTitle =
        topSeedTitle.length > 48 ? topSeedTitle.slice(0, 48) + "..." : topSeedTitle;
      sections.push({
        id: "because",
        title: "Karena kamu menyukai: " + shortTitle,
        items: toItems(becauseIds),
      });
    }
    if (popular.length > 0) {
      sections.push({ id: "popular", title: "Populer di katalog", items: popular });
    }
    if (recentIds.length > 0) {
      sections.push({
        id: "recent",
        title: "Terakhir kamu lihat",
        items: toItems(recentIds),
      });
    }

    return NextResponse.json({
      strategy: "content_personalized",
      based_on,
      sections,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
