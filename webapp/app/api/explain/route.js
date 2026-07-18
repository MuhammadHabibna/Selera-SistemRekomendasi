import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Layer penjelasan GenAI: satu kalimat alasan rekomendasi via Google Gemini.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }
  const title = String(body.product_title || "").slice(0, 200);
  const basedOn = Array.isArray(body.based_on)
    ? body.based_on.slice(0, 3).map((t) => String(t).slice(0, 200))
    : [];
  if (!title) {
    return NextResponse.json({ error: "product_title wajib diisi" }, { status: 400 });
  }

  const fallback =
    basedOn.length > 0
      ? 'Direkomendasikan karena mirip dengan produk yang kamu sukai seperti "' +
        basedOn[0] +
        '".'
      : "Produk populer di katalog yang cocok untuk mulai dijelajahi.";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ explanation: fallback, source: "fallback" });
  }

  // Normalisasi nama model (mis. "Gemini 3.1 Flash Lite" -> id API valid)
  // + fallback chain kalau model dari env tidak dikenali API.
  const raw = (process.env.GEMINI_MODEL || "").trim().toLowerCase().replace(/\s+/g, "-");
  const modelCandidates = [
    ...(raw ? [raw] : []),
    "gemini-flash-lite-latest",
    "gemini-2.0-flash",
  ];
  const likedList = basedOn.map((t) => '"' + t + '"').join(", ");
  const prompt =
    basedOn.length > 0
      ? "Kamu adalah asisten belanja. User menyukai produk berikut: " +
        likedList +
        '. Jelaskan dalam SATU kalimat singkat bahasa Indonesia yang ramah kenapa produk "' +
        title +
        '" direkomendasikan untuknya. Jawab hanya satu kalimat, tanpa pembuka.'
      : 'Jelaskan dalam SATU kalimat singkat bahasa Indonesia yang ramah kenapa produk populer "' +
        title +
        '" layak dicoba oleh pengguna baru. Jawab hanya satu kalimat, tanpa pembuka.';

  try {
    let data = null;
    for (const model of modelCandidates) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent?key=" +
        apiKey;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.6 },
        }),
      });
      if (res.ok) {
        data = await res.json();
        break;
      }
      // Model tidak dikenal (404): coba kandidat berikutnya; error lain: stop.
      if (res.status !== 404) throw new Error("Gemini HTTP " + res.status);
    }
    if (!data) throw new Error("Semua kandidat model Gemini 404");
    const candidates = data.candidates || [];
    const parts =
      candidates[0] && candidates[0].content ? candidates[0].content.parts : [];
    const text = parts && parts[0] && parts[0].text ? parts[0].text.trim() : "";
    return NextResponse.json({
      explanation: text || fallback,
      source: text ? "gemini" : "fallback",
    });
  } catch (err) {
    console.error("Gemini error:", err.message);
    return NextResponse.json({ explanation: fallback, source: "fallback" });
  }
}
