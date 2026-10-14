import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import CrackTile from "./cracks/crack-tile";
import NetworkGraph, {
  type NetworkEdge,
  type NetworkNode,
} from "./humor/network-graph";

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

// How many recent likes the sidebar shows.
const SIDEBAR_LIKES = 5;

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
  // (the sidebar's "See all") swaps it for the full list of likes on their
  // cracks.
  const { filter: filterParam } = await searchParams;
  const filter = user
    ? FILTERS.find((f) => f.key === filterParam)
    : undefined;

  // Likes from other people on my cracks, newest first. The sidebar shows
  // the latest few, highlighting ones that arrived since the last visit;
  // showing them marks them seen.
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
        max_rows: filter?.key === "activity" ? 50 : SIDEBAR_LIKES,
      })
    : { data: null, error: null };
  if (notificationsError) {
    console.error("Couldn't load like notifications", notificationsError);
  }
  const hasNew = !!notifications?.some(
    (n: LikeNotification) => !seenAt || n.liked_at > seenAt
  );
  if (hasNew) {
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

  // Everyone's shared likes, for the sidebar's mini humor map.
  const { data: network, error: networkError } = user
    ? await supabase.rpc("humor_network")
    : { data: null, error: null };
  if (networkError) {
    console.error("Couldn't load humor network", networkError);
  }
  const { nodes = [], edges = [] } = (network ?? {}) as {
    nodes?: NetworkNode[];
    edges?: NetworkEdge[];
  };

  // Filters and the new-crack button, above the feed.
  const toolbar = user && (
    <div className="flex flex-wrap items-center gap-3">
      {FILTERS.filter((f) => f.key !== "activity").map((f) => {
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
          </Link>
        );
      })}
      <Link href="/cracks/new" className={pillAccent}>
        + New Crack
      </Link>
    </div>
  );

  const feed =
    filter?.key === "activity" ? (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Likes on your cracks</h2>
          <Link href="/" className="text-sm underline">
            Back to all cracks
          </Link>
        </div>
        {isEmpty && <p className="text-sm">{filter.empty}</p>}
        <ul className="flex max-w-2xl flex-col gap-3">
          {notifications?.map((n: LikeNotification, index: number) => (
            <LikeRow
              key={`${n.crack_id}-${n.liked_at}`}
              like={n}
              index={index}
              isNew={!seenAt || n.liked_at > seenAt}
            />
          ))}
        </ul>
      </section>
    ) : (
      <>
        {filter && isEmpty && <p className="text-sm">{filter.empty}</p>}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
      </>
    );

  // A left sidebar holds the title, the account button and, for logged-in
  // users, recent likes and the humor map; the feed fills the rest. On
  // narrow screens the sidebar stacks above the feed, without the map.
  return (
    <main className="grid flex-1 grid-cols-1 content-start gap-6 p-8 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-10">
      {/* On wide screens the sidebar fills the window height and the humor
          map takes whatever room the rest leaves. */}
      <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)] lg:self-start">
        <div className="flex flex-col items-start gap-4">
          <h1 className="text-4xl leading-tight font-light tracking-tight text-title">
            cracking jokes in the city of new york
          </h1>
          <AccountButton />
        </div>
        {!user ? (
          <p className="text-sm">
            Log in to like cracks, see who likes yours, and find your humor
            match.
          </p>
        ) : (
          <>
            <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  Recent likes
                  {hasNew && (
                    <span
                      aria-label="new"
                      className="inline-block size-2 rounded-full bg-plum motion-safe:animate-pulse"
                    />
                  )}
                </h2>
                {(notifications?.length ?? 0) > 0 && (
                  <Link href="/?filter=activity" className="text-sm underline">
                    See all
                  </Link>
                )}
              </div>
              {(notifications?.length ?? 0) === 0 ? (
                <p className="text-sm opacity-75">
                  No one has liked your cracks yet — keep cracking.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {notifications?.map((n: LikeNotification, index: number) => (
                    <LikeRow
                      key={`${n.crack_id}-${n.liked_at}`}
                      like={n}
                      index={index}
                      isNew={!seenAt || n.liked_at > seenAt}
                      compact
                    />
                  ))}
                </ul>
              )}
            </section>
            <section className="hidden min-h-0 flex-1 flex-col gap-3 rounded-lg border border-black/10 p-4 lg:flex dark:border-white/15">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Humor map</h2>
                <Link href="/humor" className="text-sm underline">
                  Open →
                </Link>
              </div>
              <NetworkGraph
                nodes={nodes}
                edges={edges}
                meId={user.id}
                cracks={{}}
                compact
              />
              <Link href="/humor" className="text-xs opacity-75 hover:underline">
                See your sense of humor and who shares it
              </Link>
            </section>
            <Link
              href="/humor"
              className="text-sm underline lg:hidden"
            >
              See your humor map →
            </Link>
          </>
        )}
      </aside>
      <div className="flex flex-col gap-6">
        {toolbar}
        {feed}
      </div>
    </main>
  );
}

// One like on the user's crack: who, when, and a thumbnail. `compact` is
// the smaller sidebar version.
function LikeRow({
  like,
  index,
  isNew,
  compact = false,
}: {
  like: LikeNotification;
  index: number;
  isNew: boolean;
  compact?: boolean;
}) {
  const name = like.liker_first_name || "Someone";
  const avatar = compact ? "size-8" : "size-10";
  return (
    <li className="cascade-in" style={{ "--i": index } as React.CSSProperties}>
      <Link
        href={`/cracks/${like.crack_id}/edit`}
        className={`flex items-center gap-3 rounded-lg border ${compact ? "p-2" : "p-3"} ${
          isNew ? "border-plum bg-plum/10" : "border-black/10 dark:border-white/15"
        }`}
      >
        {like.liker_profpic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={like.liker_profpic}
            alt=""
            className={`${avatar} shrink-0 rounded-full object-cover`}
          />
        ) : (
          <span
            className={`${avatar} flex shrink-0 items-center justify-center rounded-full bg-plum text-white`}
          >
            {name[0].toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={compact ? "text-xs" : "text-sm"}>
            <span className="font-semibold">{name}</span> liked your crack ·{" "}
            {timeAgo(like.liked_at)}
          </p>
          {like.crack_text && (
            <p className="truncate text-xs opacity-75">{like.crack_text}</p>
          )}
        </div>
        {like.crack_img_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={like.crack_img_url}
            alt=""
            className={`${compact ? "size-9" : "size-12"} shrink-0 rounded object-cover`}
            loading="lazy"
          />
        )}
      </Link>
    </li>
  );
}
