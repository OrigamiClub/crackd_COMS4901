import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import LikeButton from "./cracks/like-button";

const pill =
  "flex h-10 items-center rounded-full border px-4 text-sm font-medium";
const pillOff = `${pill} border-black/10 bg-foreground text-white`;
const pillOn = `${pill} border-foreground bg-background text-foreground`;

const FILTERS = [
  { key: "mine", label: "My Cracks", empty: "You haven't posted any cracks yet." },
  { key: "liked", label: "Cracks I Like", empty: "You haven't liked any cracks yet." },
] as const;

export default async function Home({ searchParams }: PageProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myLikes } = user
    ? await supabase.from("likes").select("crack_id").eq("liker", user.id)
    : { data: null };
  const likedIds = new Set(myLikes?.map((like) => like.crack_id));

  // ?filter=mine|liked narrows the grid for logged-in users.
  const { filter: filterParam } = await searchParams;
  const filter = user
    ? FILTERS.find((f) => f.key === filterParam)
    : undefined;

  let query = supabase
    .from("cracks")
    .select("*, likes(count)")
    .order("created_at", { ascending: false });
  if (filter?.key === "mine") {
    query = query.eq("creator_id", user!.id);
  } else if (filter?.key === "liked") {
    query = query.in("id", [...likedIds]);
  }
  const { data: cracks } = await query;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[60px] font-light tracking-tight text-title">
          cracking jokes in the city of new york
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {user &&
            FILTERS.map((f) => {
              const active = filter?.key === f.key;
              return (
                <Link
                  key={f.key}
                  // Clicking the active filter goes back to all cracks.
                  href={active ? "/" : `/?filter=${f.key}`}
                  aria-current={active ? "page" : undefined}
                  className={active ? pillOn : pillOff}
                >
                  {f.label}
                </Link>
              );
            })}
          {user && (
            <Link href="/cracks/new" className={pillOff}>
              + New Crack
            </Link>
          )}
          <AccountButton />
        </div>
      </div>
      {filter && cracks?.length === 0 && (
        <p className="text-sm">{filter.empty}</p>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cracks?.map((crack) => (
          <figure
            key={crack.id}
            className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-foreground text-background dark:border-white/15"
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
