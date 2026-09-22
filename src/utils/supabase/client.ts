import { createBrowserClient } from "@supabase/ssr";

// For future Client Components (e.g. a login form) once auth is added.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
