import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateProfile } from "./actions";

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
      <Link href="/" className="self-start text-sm underline">
        ← Back to home
      </Link>
      <h1 className="text-2xl font-semibold text-title">Profile</h1>
      {isIncomplete && (
        <p className="max-w-sm text-center text-sm text-amber-700">
          Welcome! Add your first and last name to finish setting up your
          profile.
        </p>
      )}
      {profile?.profpic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.profpic}
          alt=""
          className="h-20 w-20 rounded-full object-cover"
        />
      )}
      <form
        action={updateProfile}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <input
          type="text"
          name="first_name"
          placeholder="First name"
          defaultValue={profile?.first_name ?? ""}
          required
          className="rounded-md border border-black/10 bg-white p-2"
        />
        <input
          type="text"
          name="last_name"
          placeholder="Last name"
          defaultValue={profile?.last_name ?? ""}
          required
          className="rounded-md border border-black/10 bg-white p-2"
        />
        <label className="text-sm">
          Profile photo
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="mt-1 block w-full text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Save
        </button>
      </form>
      <form action="/api/auth/logout" method="POST">
        <button type="submit" className="text-sm underline">
          Log out
        </button>
      </form>
    </main>
  );
}
