import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <div className="flex w-full justify-end">
        <AccountButton />
      </div>
      <h1 className="text-2xl font-semibold text-title">Dashboard</h1>
      <p>This page only renders for logged-in users.</p>
    </main>
  );
}
