import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { deleteCrack, updateCrack } from "../../actions";
import CrackFields from "../../crack-fields";

export default async function EditCrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: crack } = await supabase
    .from("cracks")
    .select("id, img_url, text, creator_id")
    .eq("id", id)
    .maybeSingle();

  if (!crack || crack.creator_id !== user.id) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8">
      <Link href="/" className="self-start text-sm underline">
        ← Back to home
      </Link>
      <h1 className="text-2xl font-semibold text-title">Edit meme</h1>
      {crack.img_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={crack.img_url}
          alt={crack.text ?? ""}
          className="aspect-square w-full max-w-sm rounded-lg object-cover"
        />
      )}
      <form action={updateCrack} className="flex w-full max-w-sm flex-col gap-4">
        <input type="hidden" name="id" value={crack.id} />
        <CrackFields
          photoLabel="Replace image"
          defaultText={crack.text ?? ""}
          crackId={crack.id}
        />
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Save
        </button>
      </form>
      <form action={deleteCrack}>
        <input type="hidden" name="id" value={crack.id} />
        <button type="submit" className="text-sm text-red-700 underline">
          Delete meme
        </button>
      </form>
    </main>
  );
}
