"use client";

import { useCallback, useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import Row from "@/components/Row";

// Penjelasan AI hanya untuk beberapa kartu teratas agar hemat kuota Gemini,
// dan hasilnya di-cache di localStorage per produk (TTL 7 hari).
const N_EXPLAINED = 3;
const CACHE_KEY = "selera_explanations_v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function getCached(itemIdx) {
  const entry = readCache()[itemIdx];
  if (entry && Date.now() - entry.t < CACHE_TTL_MS) return entry.text;
  return null;
}

function setCached(itemIdx, text) {
  try {
    const cache = readCache();
    cache[itemIdx] = { text, t: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage penuh/diblokir: penjelasan tetap tampil tanpa cache.
  }
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r} style={{ marginBottom: 36 }}>
          <div className="sk" style={{ height: 22, width: 240, marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 16, overflow: "hidden" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="skeleton card-fixed" key={i}>
                <div className="sk" style={{ height: 110 }} />
                <div className="sk" style={{ height: 13, width: "60%" }} />
                <div className="sk" style={{ height: 13, width: "85%" }} />
                <div className="sk" style={{ height: 30 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExplainedCard({ item, basedOn, index }) {
  const [explanation, setExplanation] = useState(() => getCached(item.item_idx));

  useEffect(() => {
    if (explanation) return;
    let cancelled = false;
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_title: item.product_title,
        based_on: basedOn,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.explanation) return;
        setExplanation(d.explanation);
        // Hanya jawaban Gemini asli yang di-cache; fallback tidak.
        if (d.source === "gemini") setCached(item.item_idx, d.explanation);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.item_idx]);

  return (
    <ProductCard item={item} index={index} explanation={explanation} fixed />
  );
}

export default function Recommendations() {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/recommendations", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Gagal memuat rekomendasi");
      setData(body);
    } catch (err) {
      setError(err.message);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <SkeletonRows />;

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            load();
          }}
        >
          {refreshing ? "Menghitung ulang ..." : "Muat ulang rekomendasi"}
        </button>
      </div>
      {data.strategy === "popularity_cold_start" ? (
        <div className="notice" style={{ marginBottom: 22 }}>
          Kamu belum punya interaksi — mulai dari produk terpopuler di bawah,
          lalu suka atau beri rating supaya rekomendasimu makin personal.
        </div>
      ) : null}
      {data.sections.map((section) => (
        <Row key={section.id} title={section.title}>
          {section.items.map((item, i) =>
            section.id === "for_you" && i < N_EXPLAINED ? (
              <ExplainedCard
                key={item.item_idx}
                item={item}
                basedOn={data.based_on}
                index={i}
              />
            ) : (
              <ProductCard key={item.item_idx} item={item} index={i} fixed />
            )
          )}
        </Row>
      ))}
    </>
  );
}
