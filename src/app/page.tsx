import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import LikeButton from "./cracks/like-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: cracks } = await supabase
    .from("cracks")
    .select("*, likes(count)")
    .order("created_at", { ascending: false });

  const { data: myLikes } = user
    ? await supabase.from("likes").select("crack_id").eq("liker", user.id)
    : { data: null };
  const likedIds = new Set(myLikes?.map((like) => like.crack_id));

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
            <div className="mt-auto flex items-center justify-between px-3 pb-3">
              <LikeButton
                crackId={crack.id}
                count={crack.likes?.[0]?.count ?? 0}
                liked={likedIds.has(crack.id)}
                loggedIn={!!user}
              />
              {user && crack.creator_id === user.id && (
                <Link
                  href={`/cracks/${crack.id}/edit`}
                  className="text-sm underline"
                >
                  Edit
                </Link>
              )}
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
