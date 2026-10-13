import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
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
      <div className="flex w-full items-center justify-between gap-4">
        <Link
          href="/"
          className="flex h-10 items-center rounded-full border border-black/10 bg-foreground px-4 text-sm font-medium text-white"
        >
          ← Back to home
        </Link>
        <AccountButton />
      </div>
      <h1 className="text-[80px] text-title">contribute a crack!</h1>
      <form action={createCrack} className="flex w-full max-w-xl flex-col gap-4">
        <CrackFields />
      </form>
    </main>
  );
}
