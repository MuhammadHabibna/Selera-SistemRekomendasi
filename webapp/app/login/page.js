"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "register") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        // User baru diarahkan ke onboarding preference elicitation.
        router.push("/onboarding");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
        router.push("/");
      }
      router.refresh();
    } catch (err) {
      setError(err.message || "Terjadi kesalahan, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-box" onSubmit={handleSubmit}>
        <span className="brand-lg">Selera</span>
        <h1 style={{ margin: 0, fontSize: 24 }}>
          {mode === "login" ? "Selamat datang kembali" : "Buat akunmu"}
        </h1>
        <p className="subtitle" style={{ margin: "0 0 6px" }}>
          Rekomendasi produk personal, dijelaskan oleh AI.
        </p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password (min. 6 karakter)"
          value={password}
          required
          minLength={6}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <div className="error">{error}</div> : null}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Daftar"}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? "Belum punya akun? Daftar"
            : "Sudah punya akun? Masuk"}
        </button>
      </form>
    </div>
  );
}
