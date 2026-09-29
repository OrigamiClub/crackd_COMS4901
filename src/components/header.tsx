import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <header className="flex justify-end p-4">
        <Link
          href="/login"
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium"
        >
          Log in
        </Link>
      </header>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, profpic")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.first_name && profile?.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : user.email;

  return (
    <header className="flex justify-end p-4">
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium"
      >
        {profile?.profpic && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.profpic}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        )}
        {displayName}
      </Link>
    </header>
  );
}
