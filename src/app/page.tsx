import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: cracks } = await supabase
    .from("cracks")
    .select()
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-title">
          Cracking Jokes in the City of New York
        </h1>
        {user && (
          <Link
            href="/cracks/new"
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium"
          >
            New meme
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cracks?.map((crack) => (
          <figure
            key={crack.id}
            className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/15"
          >
            {crack.img_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={crack.img_url}
                alt={crack.text ?? ""}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
            )}
            {crack.text && (
              <figcaption className="p-3 text-sm">{crack.text}</figcaption>
            )}
            {user && crack.creator_id === user.id && (
              <Link
                href={`/cracks/${crack.id}/edit`}
                className="mt-auto self-end px-3 pb-3 text-sm underline"
              >
                Edit
              </Link>
            )}
          </figure>
        ))}
      </div>
    </main>
  );
}
