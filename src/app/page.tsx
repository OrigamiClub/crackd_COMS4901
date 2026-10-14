import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import CrackTile from "./cracks/crack-tile";

const pill =
  "btn-pop flex h-10 items-center rounded-full border px-4 text-sm font-medium";
const pillAccent = `${pill} border-black/10 bg-title text-white`;

// Each filter has its own palette color: filled when off, outlined when
// active. Class names are written out in full so Tailwind generates them.
const FILTERS = [
  {
    key: "mine",
    label: "My Cracks",
    empty: "You haven't posted any cracks yet.",
    off: `${pill} border-black/10 bg-sage text-white`,
    on: `${pill} border-sage bg-background text-sage`,
  },
  {
    key: "liked",
    label: "Cracks I Like",
    empty: "You haven't liked any cracks yet.",
    off: `${pill} border-black/10 bg-mustard text-white`,
    on: `${pill} border-mustard bg-background text-mustard`,
  },
  {
    key: "activity",
    label: "Likes on My Cracks",
    empty: "No one has liked your cracks yet — keep cracking.",
    off: `${pill} border-black/10 bg-plum text-white`,
    on: `${pill} border-plum bg-background text-plum`,
  },
] as const;

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const TIME_UNITS = [
  { unit: "year", seconds: 365 * 24 * 60 * 60 },
  { unit: "month", seconds: 30 * 24 * 60 * 60 },
  { unit: "week", seconds: 7 * 24 * 60 * 60 },
  { unit: "day", seconds: 24 * 60 * 60 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
] as const;

// "2 hours ago", "yesterday", "now".
function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const { unit, seconds: size } of TIME_UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

type LikeNotification = {
  crack_id: number;
  crack_text: string | null;
  crack_img_url: string | null;
  liker_first_name: string | null;
  liker_profpic: string | null;
  liked_at: string;
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myLikes } = user
    ? await supabase.from("likes").select("crack_id").eq("liker", user.id)
    : { data: null };
  const likedIds = new Set(myLikes?.map((like) => like.crack_id));

  // ?filter=mine|liked narrows the grid for logged-in users; ?filter=activity
  // swaps it for a list of likes on their cracks.
  const { filter: filterParam } = await searchParams;
  const filter = user
    ? FILTERS.find((f) => f.key === filterParam)
    : undefined;

  // Likes from other people on my cracks, newest first. The dot on the
  // filter pill means some arrived since the user last opened it.
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("notifications_seen_at")
        .eq("id", user.id)
        .single()
    : { data: null };
  const seenAt = profile?.notifications_seen_at ?? null;
  const { data: notifications, error: notificationsError } = user
    ? await supabase.rpc("my_like_notifications", {
        max_rows: filter?.key === "activity" ? 50 : 1,
      })
    : { data: null, error: null };
  if (notificationsError) {
    console.error("Couldn't load like notifications", notificationsError);
  }
  const hasNew = !!notifications?.some(
    (n: LikeNotification) => !seenAt || n.liked_at > seenAt
  );
  if (filter?.key === "activity") {
    await supabase
      .from("profiles")
      .update({ notifications_seen_at: new Date().toISOString() })
      .eq("id", user!.id);
  }

  let query = supabase
    .from("cracks")
    .select("*, likes(count)")
    .order("created_at", { ascending: false });
  if (filter?.key === "mine") {
    query = query.eq("creator_id", user!.id);
  } else if (filter?.key === "liked") {
    query = query.in("id", [...likedIds]);
  }
  const { data: cracks } =
    filter?.key === "activity" ? { data: null } : await query;
  const isEmpty =
    filter?.key === "activity" ? notifications?.length === 0 : cracks?.length === 0;

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
                  className={active ? f.on : f.off}
                >
                  {f.label}
                  {f.key === "activity" && hasNew && !active && (
                    <span
                      aria-label="new"
                      className="ml-2 inline-block size-2 rounded-full bg-white motion-safe:animate-pulse"
                    />
                  )}
                </Link>
              );
            })}
          {user && (
            <Link href="/cracks/new" className={pillAccent}>
              + New Crack
            </Link>
          )}
          <AccountButton />
        </div>
      </div>
      {filter && isEmpty && <p className="text-sm">{filter.empty}</p>}
      {filter?.key === "activity" && (
        <ul className="flex max-w-2xl flex-col gap-3">
          {notifications?.map((n: LikeNotification, index: number) => {
            const isNew = !seenAt || n.liked_at > seenAt;
            const name = n.liker_first_name || "Someone";
            return (
              <li
                key={`${n.crack_id}-${n.liked_at}`}
                className="cascade-in"
                style={{ "--i": index } as React.CSSProperties}
              >
                <Link
                  href={`/cracks/${n.crack_id}/edit`}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    isNew
                      ? "border-plum bg-plum/10"
                      : "border-black/10 dark:border-white/15"
                  }`}
                >
                  {n.liker_profpic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.liker_profpic}
                      alt=""
                      className="size-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-plum text-white">
                      {name[0].toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{name}</span> liked your
                      crack · {timeAgo(n.liked_at)}
                    </p>
                    {n.crack_text && (
                      <p className="truncate text-xs opacity-75">
                        {n.crack_text}
                      </p>
                    )}
                  </div>
                  {n.crack_img_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.crack_img_url}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cracks?.map((crack, index) => (
          <CrackTile
            key={crack.id}
            id={crack.id}
            text={crack.text}
            imgUrl={crack.img_url}
            index={index}
            likeCount={crack.likes?.[0]?.count ?? 0}
            liked={likedIds.has(crack.id)}
            loggedIn={!!user}
            canEdit={!!user && crack.creator_id === user.id}
          />
        ))}
      </div>
    </main>
  );
}
