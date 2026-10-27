import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import CrackTile from "./cracks/crack-tile";
import CrackTint from "./cracks/crack-tint";
import NetworkGraph, {
  type NetworkEdge,
  type NetworkNode,
} from "./humor/network-graph";
import { styleInfo } from "@/lib/humor-vocab";

// Feed views. They share one neutral tab style so "+ New Crack" stays the
// only highlighted action; "activity" is reached from the sidebar instead.
const FILTERS = [
  {
    key: "mine",
    label: "My Cracks",
    empty: "You haven't posted any cracks yet.",
  },
  {
    key: "liked",
    label: "Cracks I Like",
    empty: "You haven't liked any cracks yet.",
  },
  {
    key: "activity",
    label: "Likes on My Cracks",
    empty: "No one has liked your cracks yet — keep cracking.",
  },
] as const;

const tab =
  "flex h-8 items-center rounded-full px-4 text-sm font-medium transition-colors";
const tabOn = `${tab} bg-foreground text-white`;
const tabOff = `${tab} text-foreground hover:bg-foreground/10`;

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

const SHORT_UNITS = { year: "y", month: "mo", week: "w", day: "d", hour: "h", minute: "m" };

// "3h", "2d", "now": for the narrow sidebar.
function shortTimeAgo(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  for (const { unit, seconds: size } of TIME_UNITS) {
    if (seconds >= size) {
      return `${Math.floor(seconds / size)}${SHORT_UNITS[unit]}`;
    }
  }
  return "now";
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
  const latestLike: LikeNotification | undefined = notifications?.[0];
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
  // The map panel is accented with the user's favorite style's color, like
  // the profile card on /humor, or plum until that's known.
  const mapColor =
    styleInfo(nodes.find((n) => n.id === user?.id)?.topStyle)?.color ??
    "var(--plum)";

  // One navigation bar above the feed: view tabs on the left, the primary
  // action and the account button on the right.
  const tabs = [
    { key: null, label: "All Cracks" },
    ...FILTERS.filter((f) => f.key !== "activity"),
  ];
  const toolbar = (
    <nav className="flex flex-wrap items-center justify-between gap-3">
      {user ? (
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-black/10 p-1 dark:border-white/15">
          {tabs.map((t) => {
            const active = (filter?.key ?? null) === t.key;
            return (
              <Link
                key={t.key ?? "all"}
                href={t.key ? `/?filter=${t.key}` : "/"}
                aria-current={active ? "page" : undefined}
                className={active ? tabOn : tabOff}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        {/* Visitors see it too; the form sends them to log in first. */}
        <Link href="/cracks/new" className="btn-primary">
          + New Crack
        </Link>
        <AccountButton />
      </div>
    </nav>
  );

  const feed =
    filter?.key === "activity" ? (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Likes on your cracks</h2>
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

  // Recent likes for the sidebar panel.
  const recentLikes = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2
          className={`section-title flex items-center gap-2 ${latestLike ? "text-(--tint)" : ""}`}
        >
          Recent likes
          {hasNew && (
            <span
              aria-label="new"
              className={`inline-block size-2 rounded-full motion-safe:animate-pulse ${latestLike ? "bg-(--tint)" : "bg-plum"}`}
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
    </>
  );

  // A left sidebar holds the title and, for logged-in users, recent likes
  // and the humor map; the nav bar and feed fill the rest. The sidebar is
  // a pale column split off by a thin line, like the admin app's, with its
  // panels sitting directly on the fill. On narrow screens it stacks above
  // the feed, without the map.
  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      {/* On wide screens the sidebar fills the window height and the humor
          map takes whatever room the rest leaves. */}
      <aside className="flex flex-col gap-6 border-b border-black/10 bg-foreground/5 p-8 lg:sticky lg:top-0 lg:h-dvh lg:w-96 lg:shrink-0 lg:border-r lg:border-b-0 dark:border-white/15">
        <h1 className="page-title text-3xl">
          cracking jokes in the city of new york
        </h1>
        {!user ? (
          <section className="card flex flex-col gap-3 text-sm">
            <h2 className="section-title">What is this?</h2>
            <p>
              A meme board for Columbia and the city around it. Scroll the
              cracks as much as you like — no account needed.
            </p>
            <p>
              Log in to like cracks, post your own (our hamsters will help with
              the caption), and see who shares your sense of humor.
            </p>
          </section>
        ) : (
          <>
            {latestLike ? (
              // Accented with the most recently liked crack's tile color.
              <CrackTint
                crackId={latestLike.crack_id}
                imgUrl={latestLike.crack_img_url}
                className="flex shrink-0 flex-col gap-3 p-5"
              >
                {recentLikes}
              </CrackTint>
            ) : (
              <section className="card flex shrink-0 flex-col gap-3">
                {recentLikes}
              </section>
            )}
            {/* Your favorite style's color, as an accent edge. */}
            <section
              className="card hidden min-h-0 flex-1 flex-col gap-3 border-l-4 lg:flex"
              style={{ borderLeftColor: mapColor }}
            >
              <h2 className="section-title" style={{ color: mapColor }}>
                <Link href="/humor" className="hover:underline">
                  Who laughs at what you laugh at →
                </Link>
              </h2>
              <NetworkGraph
                nodes={nodes}
                edges={edges}
                meId={user.id}
                cracks={{}}
                compact
              />
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
      <div className="flex min-w-0 flex-1 flex-col gap-6 p-8">
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
            <span className="font-semibold">{name}</span>{" "}
            {compact
              ? `liked this · ${shortTimeAgo(like.liked_at)}`
              : `liked your crack · ${timeAgo(like.liked_at)}`}
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
