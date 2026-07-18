// Pencatat interaksi user (view/click/like/rate) ke API.
export async function logInteraction(item_idx, interaction_type, rating_value) {
  try {
    await fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_idx, interaction_type, rating_value }),
    });
  } catch {
    // Pencatatan best-effort: kegagalan tidak boleh mengganggu UI.
  }
}

// Gradien deterministik per produk untuk tile visual kartu.
const GRADIENTS = [
  ["#7c3aed", "#db2777"],
  ["#0ea5e9", "#6366f1"],
  ["#059669", "#0ea5e9"],
  ["#f59e0b", "#db2777"],
  ["#6366f1", "#a78bfa"],
  ["#0f766e", "#84cc16"],
];

export function tileStyle(item_idx) {
  const [from, to] = GRADIENTS[item_idx % GRADIENTS.length];
  return {
    background: `linear-gradient(135deg, ${from}, ${to})`,
  };
}

export function tileInitial(title) {
  return (title || "?").trim().charAt(0).toUpperCase();
}
