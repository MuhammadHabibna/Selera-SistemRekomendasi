"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === "/login") return null;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="nav">
      <Link href="/" className="brand">Selera</Link>
      <Link className={"link" + (pathname === "/" ? " active" : "")} href="/">
        Untukmu
      </Link>
      <Link
        className={"link" + (pathname === "/browse" ? " active" : "")}
        href="/browse"
      >
        Jelajah
      </Link>
      <Link
        className={"link" + (pathname === "/profile" ? " active" : "")}
        href="/profile"
      >
        Profil
      </Link>
      <span className="spacer" />
      <button onClick={handleLogout}>Keluar</button>
    </nav>
  );
}
