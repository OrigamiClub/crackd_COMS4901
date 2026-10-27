import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SiteHeader from "@/components/site-header";
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
    <main className="flex flex-1 flex-col items-center gap-6 p-6 lg:p-8">
      <SiteHeader showNewCrack={false} />
      <h1 className="page-title max-w-2xl text-center">
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
              className="input"
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
              className="input"
            />
          </label>
        </div>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/humor" className="btn-secondary">
          Your sense of humor →
        </Link>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="btn-outline">
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
