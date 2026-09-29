"use client";

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
      <h1 className="text-2xl font-semibold text-title">Log in</h1>
      <button
        onClick={handleGoogleLogin}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      >
        Continue with Google
      </button>
    </main>
  );
}
