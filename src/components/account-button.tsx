import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

const pill =
  "btn-pop flex h-10 items-center gap-2 rounded-full border border-black/10 bg-foreground px-4 text-sm font-medium text-white";

// "Log in" pill, or the signed-in user's name/photo linking to their
// profile. Pages place it in their own top row so it lines up with the
// title and other buttons.
export default async function AccountButton() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link href="/login" className={pill}>
        Log in
      </Link>
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
    <Link href="/profile" className={pill}>
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
  );
}
