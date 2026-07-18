import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TYPES = new Set(["view", "click", "like", "rate"]);

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

  const itemIdx = Number(body.item_idx);
  const type = body.interaction_type;
  const rating = body.rating_value == null ? null : Number(body.rating_value);

  if (!Number.isInteger(itemIdx) || itemIdx < 0) {
    return NextResponse.json({ error: "item_idx tidak valid" }, { status: 400 });
  }
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: "interaction_type tidak valid" },
      { status: 400 }
    );
  }
  if (type === "rate" && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    return NextResponse.json(
      { error: "rating_value wajib 1-5 untuk interaction_type rate" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("user_interactions").insert({
    user_id: user.id,
    item_idx: itemIdx,
    interaction_type: type,
    rating_value: type === "rate" ? rating : null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
