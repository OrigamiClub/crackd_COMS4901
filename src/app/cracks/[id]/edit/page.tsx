import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SiteHeader from "@/components/site-header";
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
      <SiteHeader showNewCrack={false} />
      <h1 className="page-title">edit your crack</h1>
      <form action={updateCrack} className="flex w-full max-w-xl flex-col gap-4">
        <input type="hidden" name="id" value={crack.id} />
        <CrackFields
          defaultText={crack.text ?? ""}
          defaultImageUrl={crack.img_url}
          crackId={crack.id}
        />
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
