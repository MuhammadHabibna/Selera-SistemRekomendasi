"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ProductCard from "@/components/ProductCard";
import StarRating from "@/components/StarRating";
import { HeartIcon } from "@/components/Icons";
import { logInteraction, tileStyle, tileInitial } from "@/lib/interactions";

export default function ItemDetailPage() {
  const params = useParams();
  const itemIdx = Number(params.idx);
  const supabase = useMemo(() => createClient(), []);

  const [item, setItem] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [liked, setLiked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(itemIdx)) return;
    // Membuka halaman detail tercatat sebagai interaksi view.
    logInteraction(itemIdx, "view");

    async function load() {
      const { data: meta, error: e1 } = await supabase
        .from("items")
        .select("item_idx, product_title, product_category")
        .eq("item_idx", itemIdx)
        .single();
      if (e1) {
        setError(e1.message);
        return;
      }
      setItem(meta);

      const { data: sims } = await supabase
        .from("item_similarity")
        .select("similar_item_idx, similarity_score, rank")
        .eq("item_idx", itemIdx)
        .order("rank", { ascending: true })
        .limit(8);
      const ids = (sims || []).map((s) => s.similar_item_idx);
      if (ids.length > 0) {
        const { data: simMeta } = await supabase
          .from("items")
          .select("item_idx, product_title, product_category")
          .in("item_idx", ids);
        const metaMap = new Map((simMeta || []).map((m) => [m.item_idx, m]));
        setSimilar(
          (sims || [])
            .map((s) => metaMap.get(s.similar_item_idx))
            .filter(Boolean)
        );
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdx]);

  if (error) {
    return (
      <div className="container empty-state">
        <span className="eyebrow">Oops</span>
        <h1>Produk tidak ditemukan</h1>
        <p className="subtitle">
          Produk ini tidak ada di katalog atau tautannya salah.
        </p>
        <Link href="/browse" className="btn primary">
          Kembali ke Jelajah
        </Link>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="container">
        <div className="skeleton" style={{ maxWidth: 640 }}>
          <div className="sk" style={{ height: 140 }} />
          <div className="sk" style={{ height: 22, width: "70%" }} />
          <div className="sk" style={{ height: 36, width: 220 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="detail-hero">
        <div
          className="tile"
          style={{ ...tileStyle(item.item_idx), height: 140, marginBottom: 20 }}
        >
          {tileInitial(item.product_title)}
        </div>
        <span className="category">{item.product_category}</span>
        <h1 style={{ marginTop: 10 }}>{item.product_title}</h1>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <button
            type="button"
            className={"icon-btn" + (liked ? " liked" : " primary")}
            disabled={liked}
            onClick={async () => {
              setLiked(true);
              await logInteraction(itemIdx, "like");
            }}
          >
            <HeartIcon filled={liked} />
            <span>{liked ? "Disukai" : "Suka produk ini"}</span>
          </button>
          <StarRating onRate={(v) => logInteraction(itemIdx, "rate", v)} />
        </div>
      </div>

      <h2 style={{ fontSize: 19, marginBottom: 16 }}>Produk serupa</h2>
      <div className="grid">
        {similar.map((s, i) => (
          <ProductCard key={s.item_idx} item={s} index={i} />
        ))}
      </div>
    </div>
  );
}
