import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Recommendations from "@/components/Recommendations";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // User baru tanpa interaksi diarahkan ke onboarding sekali.
  const { count } = await supabase
    .from("user_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count) redirect("/onboarding");

  return (
    <div className="container">
      <span className="eyebrow">&#10024; Dipersonalisasi dengan AI</span>
      <h1>Rekomendasi untukmu</h1>
      <p className="subtitle">
        Dihitung ulang dari interaksi terbarumu setiap kali halaman ini dibuka.
      </p>
      <Recommendations />
    </div>
  );
}
