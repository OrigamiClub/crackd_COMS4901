import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createCrack } from "../actions";
import CrackFields from "../crack-fields";

export default async function NewCrackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <Link href="/" className="self-start text-sm underline">
        ← Back to home
      </Link>
      <h1 className="text-2xl font-semibold text-title">New meme</h1>
      <form action={createCrack} className="flex w-full max-w-sm flex-col gap-4">
        <CrackFields photoLabel="Image" photoRequired />
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Post
        </button>
      </form>
    </main>
  );
}
