import { NextResponse } from "next/server";

// TODO: validate credentials and call supabase.auth.signInWithPassword()
// (see src/utils/supabase/server.ts) once the login backend is built.
export async function POST() {
  return NextResponse.json(
    { error: "Login is not implemented yet." },
    { status: 501 }
  );
}
