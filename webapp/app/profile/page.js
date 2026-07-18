"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { tileStyle, tileInitial } from "@/lib/interactions";

const TYPE_LABEL = {
  view: "Dilihat",
  click: "Diklik",
  like: "Disukai",
  rate: "Dirating",
};
const FILTERS = ["semua", "like", "rate", "click", "view"];

// Profil: ringkasan statistik + distribusi rating + riwayat terfilter.
export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState("");
  const [filter, setFilter] = useState("semua");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setEmail(user.email || "");

      const { data: inter, error: e1 } = await supabase
        .from("user_interactions")
        .select("item_idx, interaction_type, rating_value, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (e1) {
        setError(e1.message);
        return;
      }
      const ids = [...new Set((inter || []).map((r) => r.item_idx))];
      const { data: meta } = await supabase
        .from("items")
        .select("item_idx, product_title")
        .in("item_idx", ids);
      const metaMap = new Map((meta || []).map((m) => [m.item_idx, m]));
      setRows(
        (inter || []).map((r) => ({
          ...r,
          product_title: metaMap.get(r.item_idx)
            ? metaMap.get(r.item_idx).product_title
            : "Produk #" + r.item_idx,
        }))
      );
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="container error">{error}</div>;

  const counts = { like: 0, rate: 0, click: 0, view: 0 };
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  for (const r of rows || []) {
    counts[r.interaction_type] = (counts[r.interaction_type] || 0) + 1;
    if (r.interaction_type === "rate" && r.rating_value) {
      ratingDist[r.rating_value] += 1;
      ratingSum += r.rating_value;
    }
  }
  const avgRating = counts.rate > 0 ? (ratingSum / counts.rate).toFixed(1) : null;
  const maxDist = Math.max(1, ...Object.values(ratingDist));
  const filtered = (rows || []).filter(
    (r) => filter === "semua" || r.interaction_type === filter
  );

  return (
    <div className="container">
      <span className="eyebrow">Profil</span>
      <h1>Aktivitasmu</h1>
      <p className="subtitle">
        {email ? email + " — " : ""}sinyal-sinyal ini yang dipakai Selera untuk
        menghitung rekomendasimu.
      </p>

      {!rows ? (
        <div className="skeleton" style={{ maxWidth: 640 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="sk" key={i} style={{ height: 40 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p className="subtitle">Belum ada aktivitas.</p>
          <Link href="/browse" className="btn primary">
            Mulai jelajahi produk
          </Link>
        </div>
      ) : (
        <>
          <div className="stats-grid anim-up">
            <div className="stat-tile">
              <span className="stat-num">{counts.like}</span>
              <span className="stat-label">Disukai</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num">
                {counts.rate}
                {avgRating ? (
                  <span className="stat-sub"> · rata-rata {avgRating}</span>
                ) : null}
              </span>
              <span className="stat-label">Dirating</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num">{counts.click}</span>
              <span className="stat-label">Diklik</span>
            </div>
            <div className="stat-tile">
              <span className="stat-num">{counts.view}</span>
              <span className="stat-label">Dilihat</span>
            </div>
          </div>

          {counts.rate > 0 ? (
            <section className="chart-card anim-up">
              <h2 className="chart-title">Distribusi rating yang kamu beri</h2>
              <div className="dist">
                {[5, 4, 3, 2, 1].map((v) => (
                  <div className="dist-row" key={v}>
                    <span className="dist-label">{v} bintang</span>
                    <div className="dist-track">
                      <div
                        className="dist-bar"
                        style={{ width: (ratingDist[v] / maxDist) * 100 + "%" }}
                      />
                    </div>
                    <span className="dist-value">{ratingDist[v]}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="chips" style={{ margin: "26px 0 16px" }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={"chip" + (filter === f ? " selected" : "")}
                onClick={() => setFilter(f)}
              >
                {f === "semua" ? "Semua" : TYPE_LABEL[f]}
              </button>
            ))}
          </div>

          <ul className="history">
            {filtered.slice(0, 30).map((r, i) => (
              <li className="history-item" key={i}>
                <Link
                  href={"/item/" + r.item_idx}
                  className="history-tile"
                  style={tileStyle(r.item_idx)}
                >
                  {tileInitial(r.product_title)}
                </Link>
                <div className="history-info">
                  <Link href={"/item/" + r.item_idx} className="history-title">
                    {r.product_title}
                  </Link>
                  <span className="history-meta">
                    {new Date(r.created_at).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <span className={"badge badge-" + r.interaction_type}>
                  {TYPE_LABEL[r.interaction_type] || r.interaction_type}
                  {r.interaction_type === "rate" && r.rating_value
                    ? " " + r.rating_value + "/5"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
