import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: cracks } = await supabase.from("cracks").select();

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-3xl font-semibold">cracks</h1>
      <pre className="text-sm">{JSON.stringify(cracks, null, 2)}</pre>
    </main>
  );
}
