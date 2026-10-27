import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();

        if (!profile?.first_name || !profile?.last_name) {
          return NextResponse.redirect(`${origin}/profile`);
        }
      }

      return NextResponse.redirect(`${origin}/`);
    }
  }

  // Supabase sends back an error instead of a code when a database trigger
  // refused the new account (check_signup_allowed: the address or domain
  // isn't on the admin's allowed list).
  if (searchParams.get("error_description")?.includes("Database error saving new user")) {
    return NextResponse.redirect(`${origin}/login?error=not-allowed`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
