import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import { updateProfile } from "./actions";
import AvatarPicker from "./avatar-picker";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, profpic")
    .eq("id", user.id)
    .single();

  const isIncomplete = !profile?.first_name || !profile?.last_name;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <div className="flex w-full items-center justify-between gap-4">
        <Link
          href="/"
          className="flex h-10 items-center rounded-full border border-black/10 bg-foreground px-4 text-sm font-medium text-white"
        >
          ← Back to home
        </Link>
        <AccountButton />
      </div>
      <h1 className="max-w-2xl text-center text-[40px] leading-tight font-light tracking-tight text-title">
        we promise not to sell your information to Facebook
      </h1>
      {isIncomplete && (
        <p className="max-w-sm text-center text-sm text-amber-700">
          Welcome! Add your first and last name to finish setting up your
          profile.
        </p>
      )}
      <form
        action={updateProfile}
        className="flex w-full max-w-md flex-col gap-6"
      >
        <AvatarPicker currentUrl={profile?.profpic ?? null} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            First name
            <input
              type="text"
              name="first_name"
              defaultValue={profile?.first_name ?? ""}
              required
              autoComplete="given-name"
              className="rounded-md border border-black/10 bg-white p-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Last name
            <input
              type="text"
              name="last_name"
              defaultValue={profile?.last_name ?? ""}
              required
              autoComplete="family-name"
              className="rounded-md border border-black/10 bg-white p-2 text-base"
            />
          </label>
        </div>
        <button
          type="submit"
          className="flex h-10 items-center justify-center rounded-full border border-black/10 bg-foreground px-4 text-sm font-medium text-white"
        >
          Save
        </button>
      </form>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="flex h-10 items-center rounded-full border border-foreground px-4 text-sm font-medium text-foreground"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
