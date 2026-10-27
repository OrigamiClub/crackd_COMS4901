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
      <h1 className="page-title">contribute a crack!</h1>
      <form action={createCrack} className="flex w-full max-w-xl flex-col gap-4">
        <CrackFields />
      </form>
    </main>
  );
}
