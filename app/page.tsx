"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Entry point for "/". This is NOT a login form — the real login lives at /login.
 * Here we just check for a session and send the user to the right place:
 *   logged in  -> /dashboard
 *   logged out -> /login
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function route() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      router.replace(session ? "/dashboard" : "/login");
    }
    route();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-zinc-900 text-zinc-500">
      Loading…
    </div>
  );
}
