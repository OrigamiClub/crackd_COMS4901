import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for server-side background work (crack tagging,
// humor summaries) that runs without a user's cookies and writes tables
// users can't. Bypasses RLS, so never import this from client code.
// Returns null when SUPABASE_SERVICE_ROLE_KEY isn't set.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return null;
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
