"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tileStyle, tileInitial } from "@/lib/interactions";
import { GENRES, USER_TYPES, matchGenres } from "@/lib/genres";
import { CheckIcon } from "@/components/Icons";

// Preference elicitation 3 langkah: (1) kategori minat, (2) tipe pengguna,
// (3) pilih produk (min 3, difilter dari jawaban 1-2). Pilihan produk
// disimpan sebagai interaksi "like".
const N_CANDIDATES = 24;
const POOL_SIZE = 400;
const MIN_PICKS = 3;
const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(1);
  const [pool, setPool] = useState(null);
  const [genreIds, setGenreIds] = useState([]);
  const [userType, setUserType] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("item_popularity")
        .select("item_idx, items(product_title, product_category)")
        .order("popularity_rank", { ascending: true })
        .limit(POOL_SIZE);
      if (err) {
        setError(err.message);
        return;
      }
      setPool(
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

  function toggleGenre(id) {
    setGenreIds((prev) =>
      prev.includes(id)
        ? prev.filter((g) => g !== id)
        : prev.length < 3
          ? [...prev, id]
          : prev
    );
  }

  function buildCandidates(chosenType) {
    const type = USER_TYPES.find((t) => t.id === chosenType);
    const activeGenres = [...new Set([...genreIds, ...(type ? type.genres : [])])];
    let filtered = (pool || []).filter((p) =>
      matchGenres(p.product_title, activeGenres)
    );
    // Lengkapi dengan produk populer lain kalau hasil filter kurang.
    if (filtered.length < N_CANDIDATES) {
      const have = new Set(filtered.map((p) => p.item_idx));
      filtered = filtered.concat(
        (pool || []).filter((p) => !have.has(p.item_idx))
      );
    }
    setCandidates(filtered.slice(0, N_CANDIDATES));
  }

  function togglePick(idx) {
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

  if (error && !pool) {
    return (
      <div className="container">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!pool || saving) {
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
      <span className="eyebrow">Kenali seleramu — langkah {step} dari {TOTAL_STEPS}</span>
      <div className="progress-track" aria-hidden="true">
        <div
          className="progress-fill"
          style={{ width: (step / TOTAL_STEPS) * 100 + "%" }}
        />
      </div>

      {step === 1 ? (
        <div className="anim-up">
          <h1>Kategori apa yang menarik untukmu?</h1>
          <p className="subtitle">Pilih 1-3 kategori.</p>
          <div className="chips">
            {GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                className={"chip" + (genreIds.includes(g.id) ? " selected" : "")}
                onClick={() => toggleGenre(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={genreIds.length < 1}
            onClick={() => setStep(2)}
          >
            Lanjut
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="anim-up">
          <h1>Kamu tipe pengguna yang mana?</h1>
          <p className="subtitle">
            Ini membantu kami memilihkan produk yang relevan.
          </p>
          <div className="type-grid">
            {USER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={"type-card" + (userType === t.id ? " selected" : "")}
                onClick={() => setUserType(t.id)}
              >
                <span className="type-label">{t.label}</span>
                <span className="type-desc">{t.desc}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(1)}>Kembali</button>
            <button
              className="primary"
              disabled={!userType}
              onClick={() => {
                buildCandidates(userType);
                setStep(3);
              }}
            >
              Lanjut
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="anim-up">
          <h1>Pilih produk yang menarik untukmu</h1>
          <p className="subtitle">
            Disaring dari jawabanmu — pilih minimal {MIN_PICKS}.
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
                  onClick={() => togglePick(item.item_idx)}
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
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(2)}>Kembali</button>
              <button
                className="primary"
                disabled={picked.size < MIN_PICKS}
                onClick={save}
              >
                Mulai jelajahi rekomendasimu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
