"use client";

import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-[150px] leading-none font-light tracking-tight text-title">Log in</h1>
      <p className="text-xl font-light tracking-tight text-title">Don&apos;t be a stranger :)</p>
      <button onClick={handleGoogleLogin} className="btn-primary">
        Continue with Google
      </button>
      <Link href="/" className="text-sm underline">
        or just browse the cracks first
      </Link>
    </main>
  );
}
