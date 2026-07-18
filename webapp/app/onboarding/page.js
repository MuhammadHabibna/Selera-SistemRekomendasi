"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tileStyle, tileInitial } from "@/lib/interactions";
import { CheckIcon } from "@/components/Icons";

// Preference elicitation: user memilih beberapa produk yang menarik
// (min 3) dari grid produk populer — pola onboarding standar aplikasi
// rekomendasi. Pilihan disimpan sebagai interaksi "like".
const N_CANDIDATES = 24;
const MIN_PICKS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [candidates, setCandidates] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("item_popularity")
        .select("item_idx, items(product_title, product_category)")
        .order("popularity_rank", { ascending: true })
        .limit(N_CANDIDATES);
      if (err) {
        setError(err.message);
        return;
      }
      setCandidates(
        (data || [])
          .map((r) => ({
            item_idx: r.item_idx,
            product_title: r.items ? r.items.product_title : null,
            product_category: r.items ? r.items.product_category : null,
          }))
          .filter((r) => r.product_title)
      );
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(idx) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      for (const idx of picked) {
        const res = await fetch("/api/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_idx: idx, interaction_type: "like" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Gagal menyimpan preferensi");
        }
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (error && !candidates) {
    return (
      <div className="container">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!candidates || saving) {
    return (
      <div className="container">
        <span className="eyebrow">
          {saving ? "Menyimpan preferensimu" : "Menyiapkan onboarding"}
        </span>
        <div className="pick-grid" style={{ marginTop: 20 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="skeleton" key={i}>
              <div className="sk" style={{ height: 84 }} />
              <div className="sk" style={{ height: 13, width: "75%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <span className="eyebrow">Kenali seleramu</span>
      <h1>Pilih produk yang menarik untukmu</h1>
      <p className="subtitle">
        Pilih minimal {MIN_PICKS} — makin banyak yang kamu pilih, makin akurat
        rekomendasimu.
      </p>
      <div className="pick-grid">
        {candidates.map((item, i) => {
          const isPicked = picked.has(item.item_idx);
          return (
            <button
              key={item.item_idx}
              type="button"
              className={"pick anim-up" + (isPicked ? " picked" : "")}
              style={{ "--d": Math.min(i, 12) * 40 + "ms" }}
              onClick={() => toggle(item.item_idx)}
              aria-pressed={isPicked}
            >
              <div className="tile" style={tileStyle(item.item_idx)}>
                {tileInitial(item.product_title)}
                {isPicked ? (
                  <span className="pick-check">
                    <CheckIcon />
                  </span>
                ) : null}
              </div>
              <span className="pick-title">{item.product_title}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <div className="error" style={{ marginBottom: 12 }}>{error}</div>
      ) : null}
      <div className="pick-footer">
        <span className="progress">
          {picked.size} dipilih
          {picked.size < MIN_PICKS
            ? " — pilih " + (MIN_PICKS - picked.size) + " lagi"
            : ""}
        </span>
        <button
          className="primary"
          disabled={picked.size < MIN_PICKS}
          onClick={save}
        >
          Mulai jelajahi rekomendasimu
        </button>
      </div>
    </div>
  );
}
