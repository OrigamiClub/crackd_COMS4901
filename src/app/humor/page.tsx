import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/utils/supabase/server";
import AccountButton from "@/components/account-button";
import {
  computeHumorProfile,
  refreshHumorSummary,
  tagCracks,
  type TagStat,
  type Traits,
} from "@/lib/humor";
import { styleInfo } from "@/lib/humor-vocab";
import NetworkGraph, { type NetworkEdge, type NetworkNode } from "./network-graph";

// The humor network (who likes the same cracks as whom) and the signed-in
// user's humor profile, from their likes and caption picks. Each visit also
// tags a few untagged cracks and refreshes the summary in the background.
export default async function HumorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [network, cracks, traitRows, myLikes, captionRequests, humorProfile] =
    await Promise.all([
      supabase.rpc("humor_network"),
      supabase.from("cracks").select("id, text, img_url"),
      supabase.from("crack_traits").select("crack_id, styles, topics"),
      supabase.from("likes").select("crack_id").eq("liker", user.id),
      supabase
        .from("caption_requests")
        .select("options, chosen_index")
        .eq("user_id", user.id)
        .not("chosen_index", "is", null),
      supabase
        .from("humor_profiles")
        .select("summary")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (network.error) {
    console.error("Couldn't load humor network", network.error);
  }

  const { nodes = [], edges = [] } = (network.data ?? {}) as {
    nodes?: NetworkNode[];
    edges?: NetworkEdge[];
  };
  const crackMap = Object.fromEntries(
    (cracks.data ?? []).map((c) => [c.id, { text: c.text, img_url: c.img_url }])
  );
  const traits = new Map<number, Traits>(
    (traitRows.data ?? []).map((t) => [
      t.crack_id,
      { styles: t.styles ?? [], topics: t.topics ?? [] },
    ])
  );
  const profile = computeHumorProfile(
    traits,
    (myLikes.data ?? []).map((l) => l.crack_id),
    captionRequests.data ?? []
  );

  const untagged = (cracks.data?.length ?? 0) - traits.size;
  after(async () => {
    if (untagged > 0) await tagCracks();
    await refreshHumorSummary(user.id, profile);
  });

  // The person you share the most liked cracks with.
  const myEdges = edges.filter((e) => e.a === user.id || e.b === user.id);
  const closest = myEdges.sort((a, b) => b.shared - a.shared)[0];
  const closestNode = closest
    ? nodes.find((n) => n.id === (closest.a === user.id ? closest.b : closest.a))
    : null;

  // The profile card is tinted with your favorite style's color (the same
  // as your ring in the graph), or plum until that's known.
  const myStyle = nodes.find((n) => n.id === user.id)?.topStyle;
  const cardColor = styleInfo(myStyle)?.color ?? "var(--plum)";

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex w-full items-center justify-between gap-4">
        <Link
          href="/"
          className="btn-pop flex h-10 items-center rounded-full border border-black/10 bg-foreground px-4 text-sm font-medium text-white"
        >
          ← Back to home
        </Link>
        <AccountButton />
      </div>
      <h1 className="text-[48px] leading-tight font-light tracking-tight text-title">
        your humor network
      </h1>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section className="flex flex-col gap-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="text-lg font-semibold">Who laughs at what you laugh at</h2>
          <NetworkGraph
            nodes={nodes}
            edges={edges}
            meId={user.id}
            cracks={crackMap}
          />
          {closestNode && (
            <p className="text-sm">
              Closest humor match:{" "}
              <span className="font-semibold">{closestNode.name || "Someone"}</span>{" "}
              — you both liked {closest.shared}{" "}
              {closest.shared === 1 ? "crack" : "cracks"}.
            </p>
          )}
        </section>

        <section
          className="flex flex-col gap-4 rounded-lg border p-5"
          style={{
            backgroundColor: `color-mix(in srgb, ${cardColor} 22%, var(--background))`,
            borderColor: `color-mix(in srgb, ${cardColor} 60%, transparent)`,
          }}
        >
          <h2 className="text-lg font-semibold" style={{ color: cardColor }}>
            Your sense of humor
            {styleInfo(myStyle) && (
              <span className="ml-2 text-sm font-normal opacity-80">
                · mostly {styleInfo(myStyle)!.label.toLowerCase()}
              </span>
            )}
          </h2>

          {humorProfile.data?.summary && (
            <p className="text-base italic">{humorProfile.data.summary}</p>
          )}

          {!profile.enough ? (
            <p className="text-sm">
              Like a few more cracks (or pick some hamster captions) and we&apos;ll
              tell you what makes you laugh.
            </p>
          ) : (
            <>
              <TagList
                title="You love"
                stats={profile.loves}
                empty="Nothing stands out yet — you laugh at a bit of everything."
                describe={(s) => `liked ${s.liked} of ${s.inFeed}`}
              />
              <TagList
                title="Not really your thing"
                stats={profile.notMine}
                empty="Nothing you seem to skip so far."
                describe={(s) => `liked ${s.liked} of ${s.inFeed}`}
              />
              {profile.pickStats.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">
                    When the hamsters offer…
                  </h3>
                  {profile.pickStats.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-sm">
                      <span className="w-36 shrink-0">{s.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${(s.chosen / s.offered) * 100}%`,
                            backgroundColor: styleInfo(s.key)?.color,
                          }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-xs opacity-75">
                        picked {s.chosen}/{s.offered}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <p className="mt-auto text-xs opacity-60">
            Based on {profile.likedTagged} liked{" "}
            {profile.likedTagged === 1 ? "crack" : "cracks"} and {profile.picks}{" "}
            caption {profile.picks === 1 ? "pick" : "picks"}. &ldquo;Not your
            thing&rdquo; means common in the feed but rarely liked by you.
            {untagged > 0 &&
              ` ${untagged} ${untagged === 1 ? "crack is" : "cracks are"} still being sorted by the hamsters.`}
          </p>
        </section>
      </div>
    </main>
  );
}

function TagList({
  title,
  stats,
  empty,
  describe,
}: {
  title: string;
  stats: TagStat[];
  empty: string;
  describe: (stat: TagStat) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {stats.length === 0 ? (
        <p className="text-sm opacity-75">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {stats.map((s, index) => (
            <li
              key={s.key}
              className="cascade-in rounded-full px-3 py-1 text-sm text-white"
              style={
                {
                  "--i": index,
                  backgroundColor: styleInfo(s.key)?.color ?? "var(--foreground)",
                } as React.CSSProperties
              }
            >
              {s.label} <span className="opacity-80">· {describe(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
