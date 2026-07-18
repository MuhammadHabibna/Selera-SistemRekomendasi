"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductCard from "@/components/ProductCard";

export default function BrowsePage() {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function search(q) {
    setLoading(true);
    setError("");
    let req = supabase
      .from("items")
      .select("item_idx, product_title, product_category")
      .limit(30);
    if (q) req = req.ilike("product_title", "%" + q + "%");
    const { data, error: err } = await req;
    if (err) setError(err.message);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <h1>Jelajah Produk</h1>
      <p className="subtitle">
        Cari produk, lalu suka atau beri rating — rekomendasimu akan ikut
        berubah.
      </p>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <input
          type="text"
          placeholder="Cari judul produk ..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" type="submit">
          Cari
        </button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="skeleton" key={i}>
              <div className="sk" style={{ height: 110 }} />
              <div className="sk" style={{ height: 14, width: "60%" }} />
              <div className="sk" style={{ height: 34 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid">
          {items.map((item, i) => (
            <ProductCard key={item.item_idx} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
