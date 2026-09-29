import { NextResponse } from "next/server";

// TODO: validate input and call supabase.auth.signUp()
// (see src/utils/supabase/server.ts) once the login backend is built.
export async function POST() {
  return NextResponse.json(
    { error: "Sign up is not implemented yet." },
    { status: 501 }
  );
}
