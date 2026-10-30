import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SiteHeader from "@/components/site-header";
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
    <main className="flex flex-1 flex-col items-center gap-6 p-6 lg:p-8">
      <SiteHeader showNewCrack={false} />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="page-title">crack a joke</h1>
        <p className="text-sm opacity-75">
          Pick a photo, let the AI hamsters suggest three captions, choose the
          funniest and post it to the board.
        </p>
      </div>
      <form action={createCrack} className="flex w-full max-w-xl flex-col gap-4">
        <CrackFields />
      </form>
    </main>
  );
}
