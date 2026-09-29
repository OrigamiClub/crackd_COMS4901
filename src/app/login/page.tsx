"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// TODO: wire this up to /api/auth/login once the login backend exists.
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (response.ok) {
      router.push("/");
      router.refresh();
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Something went wrong.");
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-title">Log in</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <input
          type="email"
          name="email"
          placeholder="Email"
          required
          className="rounded-md border border-black/10 bg-white p-2"
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          className="rounded-md border border-black/10 bg-white p-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Log in
        </button>
      </form>
    </main>
  );
}
