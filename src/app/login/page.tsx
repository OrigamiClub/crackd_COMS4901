"use client";

import Link from "next/link";
import { use } from "react";
import { createClient } from "@/utils/supabase/client";
import Wordmark from "@/components/wordmark";

const ERRORS: Record<string, string> = {
  auth: "That didn't work. Try logging in again.",
  "not-allowed": "Sign-ups are limited to approved email addresses, and yours isn't on the list.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const error = ERRORS[use(searchParams).error?.toString() ?? ""];

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center lg:p-8">
      <Wordmark tagline className="items-center" />
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Log in</h1>
        <p className="text-sm opacity-75">Don&apos;t be a stranger :)</p>
      </div>
      {error && (
        <p role="alert" className="max-w-md text-center text-sm text-red-700">
          {error}
        </p>
      )}
      <button onClick={handleGoogleLogin} className="btn-primary">
        Continue with Google
      </button>
      <Link href="/" className="text-sm underline">
        or just browse the jokes first
      </Link>
    </main>
  );
}
