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

// Riwayat interaksi user — memperlihatkan sinyal yang dipelajari sistem.
export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState("");
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
        .limit(60);
      if (e1) {
        setError(e1.message);
        return;
      }
      const ids = [...new Set((inter || []).map((r) => r.item_idx))];
      const { data: meta } = await supabase
        .from("items")
        .select("item_idx, product_title, product_category")
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

  return (
    <div className="container">
      <span className="eyebrow">Profil</span>
      <h1>Aktivitasmu</h1>
      <p className="subtitle">
        {email ? email + " — " : ""}semua sinyal ini yang dipakai Selera untuk
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
        <ul className="history">
          {rows.map((r, i) => (
            <li className="history-item anim-up" key={i} style={{ "--d": Math.min(i, 12) * 30 + "ms" }}>
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
      )}
    </div>
  );
}
