import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import Wordmark from "@/components/wordmark";
import CrackTile from "./cracks/crack-tile";
import CrackTint from "./cracks/crack-tint";
import NetworkGraph, {
  type NetworkEdge,
  type NetworkNode,
} from "./humor/network-graph";
import { styleInfo } from "@/lib/humor-vocab";

// Feed views. Posts are "jokes"; "crack" is only the verb (you crack a
// joke). They share one neutral tab style so "+ Crack a joke" stays the
// only highlighted action; "activity" is reached from the sidebar instead.
const ALL_VIEW = {
  key: null,
  label: "All jokes",
  description: "The newest jokes from everyone. Like the ones that land — your likes shape your humor profile.",
};
const FILTERS = [
  {
    key: "mine",
    label: "Jokes I've cracked",
    description: "Everything you've posted. Use Edit on a card to change it.",
    empty: "You haven't cracked any jokes yet.",
  },
  {
    key: "liked",
    label: "Jokes I liked",
    description: "Jokes you've liked. Tap Liked again to take a like back.",
    empty: "You haven't liked any jokes yet.",
  },
  {
    key: "activity",
    label: "Likes on my jokes",
    description: "Who liked your jokes, newest first.",
    empty: "No one has liked your jokes yet — keep cracking.",
  },
] as const;

const tab =
  "flex h-8 items-center rounded-full px-4 text-sm font-medium transition-colors";
const tabOn = `${tab} bg-foreground text-white`;
const tabOff = `${tab} text-foreground hover:bg-foreground/10`;

// What logging in unlocks, for visitors' sidebar.
const HOW_IT_WORKS = [
  "Upload a photo. Our AI hamsters write three captions; pick the funniest and post it.",
  "Like the jokes that make you laugh.",
  "See your humor profile and who on campus laughs at the same things.",
];

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
  const myStyle = styleInfo(nodes.find((n) => n.id === user?.id)?.topStyle);
  const mapColor = myStyle?.color ?? "var(--plum)";
  // The person you share the most liked jokes with, for the map's headline.
  const closest = edges
    .filter((e) => e.a === user?.id || e.b === user?.id)
    .sort((a, b) => b.shared - a.shared)[0];
  const closestName = closest
    ? nodes.find((n) => n.id === (closest.a === user?.id ? closest.b : closest.a))?.name ||
      "Someone"
    : null;

  // One navigation bar above the feed: view tabs on the left, the primary
  // action and the account button on the right.
  const tabs = [ALL_VIEW, ...FILTERS.filter((f) => f.key !== "activity")];
  const view = filter ?? ALL_VIEW;
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
          + Crack a joke
        </Link>
        <AccountButton />
      </div>
    </nav>
  );

  const feed =
    filter?.key === "activity" ? (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Likes on your jokes</h2>
          <Link href="/" className="text-sm underline">
            Back to all jokes
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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
          No one has liked your jokes yet — keep cracking.
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

  // A left sidebar holds the wordmark and, for logged-in users, recent
  // likes and a humor-match card around the mini map (visitors get a
  // how-it-works card instead; their login button is in the feed intro); the nav bar and feed fill the rest. The sidebar is a
  // pale column split off by a thin line, like the admin app's. On narrow
  // screens it stacks above the feed, without the map.
  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      {/* On wide screens the sidebar fills the window height and the humor
          map takes whatever room the rest leaves. In a short window the map
          keeps its minimum size and the sidebar scrolls instead. */}
      <aside className="flex flex-col gap-6 border-b border-black/10 bg-foreground/5 p-6 lg:sticky lg:top-0 lg:h-dvh lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-8 dark:border-white/15">
        <h1>
          <Wordmark tagline />
        </h1>
        {!user ? (
          <>
            <section className="card flex flex-col gap-4 text-sm">
              <h2 className="section-title">How it works</h2>
              <ol className="flex flex-col gap-3">
                {HOW_IT_WORKS.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-white">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
            <p className="mt-auto hidden text-xs opacity-75 lg:block">
              A COMS 4901 project at Columbia University.
            </p>
          </>
        ) : (
          <>
            {latestLike ? (
              // Accented with the most recently liked crack's tile color.
              <CrackTint
                crackId={latestLike.crack_id}
                imgUrl={latestLike.crack_img_url}
                className="flex shrink-0 flex-col gap-3 p-4"
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
              className="card hidden flex-1 flex-col gap-3 border-l-4 lg:flex"
              style={{ borderLeftColor: mapColor }}
            >
              <div className="flex flex-col gap-1">
                <h2 className="section-title" style={{ color: mapColor }}>
                  Your humor match
                </h2>
                <p className="text-sm">
                  {closestName ? (
                    <>
                      You and <span className="font-semibold">{closestName}</span>{" "}
                      liked {closest.shared} of the same{" "}
                      {closest.shared === 1 ? "joke" : "jokes"}.
                    </>
                  ) : (
                    "Like a few jokes to find people who laugh at the same things."
                  )}
                  {myStyle && ` Your humor: mostly ${myStyle.label.toLowerCase()}.`}
                </p>
                <p className="text-xs opacity-75">
                  You&apos;re the big circle. A line joins two people who liked
                  the same jokes; thicker means more in common.
                </p>
              </div>
              <NetworkGraph
                nodes={nodes}
                edges={edges}
                meId={user.id}
                cracks={{}}
                compact
              />
              <Link href="/humor" className="btn-outline shrink-0">
                Explore your humor map →
              </Link>
            </section>
            <Link
              href="/humor"
              className="text-sm underline lg:hidden"
            >
              See your humor match →
            </Link>
          </>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 lg:p-8">
        {toolbar}
        {user ? (
          <p className="-mt-2 text-sm opacity-75">{view.description}</p>
        ) : (
          <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="heading">Columbia&apos;s AI-assisted meme board</h2>
              <p className="text-sm opacity-75">
                Post a photo and our AI suggests the punchline. Like the jokes
                that land, and find out who on campus shares your sense of humor.
              </p>
            </div>
            <Link href="/login" className="btn-secondary shrink-0">
              Log in to post and like
            </Link>
          </section>
        )}
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
              : `liked your joke · ${timeAgo(like.liked_at)}`}
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
