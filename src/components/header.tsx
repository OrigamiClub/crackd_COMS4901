import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex justify-end p-4">
      {user ? (
        <Link
          href="/profile"
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium"
        >
          {user.email}
        </Link>
      ) : (
        <Link
          href="/login"
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium"
        >
          Log in
        </Link>
      )}
    </header>
  );
}
