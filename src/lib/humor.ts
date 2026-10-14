import "server-only";
import { callGemini } from "@/lib/gemini";
import { fetchOwnCrackImage } from "@/lib/images";
import {
  STYLES,
  STYLE_KEYS,
  TOPICS,
  TOPIC_KEYS,
  tagLabel,
} from "@/lib/humor-vocab";
import { createAdminClient } from "@/utils/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type Traits = { styles: string[]; topics: string[] };

// A generated caption option. Older caption_requests rows stored plain
// strings, which have no style.
export type CaptionOption = { caption: string; style: string | null };

export function parseCaptionOption(option: unknown): CaptionOption | null {
  if (typeof option === "string") {
    return { caption: option, style: null };
  }
  if (option && typeof option === "object" && "caption" in option) {
    const { caption, style } = option as { caption: unknown; style?: unknown };
    if (typeof caption !== "string") return null;
    return {
      caption,
      style: typeof style === "string" && STYLE_KEYS.includes(style) ? style : null,
    };
  }
  return null;
}

const TAG_PROMPT =
  "You classify memes from a Columbia University / New York City meme board. " +
  "Given the meme's caption (and image, when attached), pick the humor " +
  "styles it uses (1-3) and what it's about (1-2 topics), using only the " +
  `allowed values.\n\nStyles: ${STYLES.map((s) => `${s.key} (${s.label})`).join(", ")}.` +
  `\nTopics: ${TOPICS.map((t) => `${t.key} (${t.label})`).join(", ")}.`;

const TAG_SCHEMA = {
  type: "OBJECT",
  properties: {
    styles: { type: "ARRAY", items: { type: "STRING", enum: STYLE_KEYS } },
    topics: { type: "ARRAY", items: { type: "STRING", enum: TOPIC_KEYS } },
  },
  required: ["styles", "topics"],
};

function onlyAllowed(values: unknown, allowed: readonly string[], max: number) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v) => allowed.includes(v)))].slice(0, max);
}

// Asks Gemini for a crack's humor styles and topics and stores them in
// crack_traits. Pictures hosted elsewhere are tagged from the caption only.
async function tagCrack(
  admin: AdminClient,
  crack: { id: number; text: string | null; img_url: string | null }
) {
  const parts: Parameters<typeof callGemini>[0] = [
    { text: `${TAG_PROMPT}\n\nCaption: ${crack.text ?? "(none)"}` },
  ];
  if (crack.img_url) {
    const image = await fetchOwnCrackImage(crack.img_url);
    if ("data" in image) {
      parts.unshift({ inline_data: { mime_type: image.type, data: image.data } });
    }
  }

  const result = await callGemini(parts, TAG_SCHEMA);
  if ("error" in result) {
    console.error(`Couldn't tag crack ${crack.id}:`, result.error);
    return;
  }

  const json = result.json as { styles?: unknown; topics?: unknown };
  const { error } = await admin.from("crack_traits").upsert({
    crack_id: crack.id,
    styles: onlyAllowed(json.styles, STYLE_KEYS, 3),
    topics: onlyAllowed(json.topics, TOPIC_KEYS, 2),
    tagged_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`Couldn't save tags for crack ${crack.id}`, error);
  }
}

// Tags the given cracks (or, with no ids, up to `limit` untagged ones).
// Meant to run inside after(), so it never throws.
export async function tagCracks({
  ids,
  limit = 3,
}: { ids?: number[]; limit?: number } = {}) {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Skipping crack tagging: SUPABASE_SERVICE_ROLE_KEY isn't set.");
    return;
  }

  try {
    let query = admin.from("cracks").select("id, text, img_url");
    if (ids) {
      query = query.in("id", ids);
    }
    const [{ data: cracks }, { data: tagged }] = await Promise.all([
      query,
      admin.from("crack_traits").select("crack_id"),
    ]);

    const taggedIds = new Set(tagged?.map((t) => t.crack_id));
    const todo = ids
      ? (cracks ?? [])
      : (cracks ?? []).filter((c) => !taggedIds.has(c.id)).slice(0, limit);

    for (const crack of todo) {
      await tagCrack(admin, crack);
    }
  } catch (error) {
    console.error("Crack tagging failed", error);
  }
}

export type TagStat = {
  key: string;
  label: string;
  liked: number;
  inFeed: number;
  lift: number;
};

export type PickStat = {
  key: string;
  label: string;
  chosen: number;
  offered: number;
};

export type HumorProfile = {
  likedTagged: number;
  picks: number;
  enough: boolean;
  loves: TagStat[];
  notMine: TagStat[];
  pickStats: PickStat[];
};

// Works out what a user likes from their likes (compared with how common
// each tag is in the whole feed) and from which caption styles they pick.
// Lift > 1 means a tag shows up more in their likes than in the feed;
// +1/+3 smoothing keeps one or two likes from swinging it wildly.
export function computeHumorProfile(
  traits: Map<number, Traits>,
  likedIds: number[],
  captionRequests: { options: unknown; chosen_index: number | null }[]
): HumorProfile {
  const liked = likedIds.filter((id) => traits.has(id));
  const tagCounts = (ids: Iterable<number>) => {
    const counts = new Map<string, number>();
    for (const id of ids) {
      const t = traits.get(id)!;
      for (const tag of [...t.styles, ...t.topics]) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  };
  const feedCounts = tagCounts(traits.keys());
  const likedCounts = tagCounts(liked);

  const tagStats: TagStat[] = [...feedCounts].map(([key, inFeed]) => {
    const likedWithTag = likedCounts.get(key) ?? 0;
    const lift =
      (likedWithTag + 1) / (liked.length + 3) / ((inFeed + 1) / (traits.size + 3));
    return { key, label: tagLabel(key), liked: likedWithTag, inFeed, lift };
  });

  const loves = tagStats
    .filter((s) => s.lift >= 1.3 && s.liked >= 2)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 3);
  const notMine = tagStats
    .filter((s) => s.lift <= 0.6 && s.inFeed >= 3)
    .sort((a, b) => a.lift - b.lift)
    .slice(0, 3);

  // Only batches the user actually picked from, with styled options.
  const pickCounts = new Map<string, { chosen: number; offered: number }>();
  let picks = 0;
  for (const request of captionRequests) {
    if (request.chosen_index === null || !Array.isArray(request.options)) continue;
    const options = request.options.map(parseCaptionOption);
    if (options.some((o) => !o?.style)) continue;
    picks++;
    options.forEach((option, index) => {
      const counts = pickCounts.get(option!.style!) ?? { chosen: 0, offered: 0 };
      counts.offered++;
      if (index === request.chosen_index) counts.chosen++;
      pickCounts.set(option!.style!, counts);
    });
  }
  const pickStats = [...pickCounts]
    .map(([key, c]) => ({ key, label: tagLabel(key), ...c }))
    .sort((a, b) => b.chosen / b.offered - a.chosen / a.offered || b.offered - a.offered);

  return {
    likedTagged: liked.length,
    picks,
    enough: liked.length >= 3 || picks >= 2,
    loves,
    notMine,
    pickStats,
  };
}

const SUMMARY_MIN_NEW_SIGNALS = 3;
const SUMMARY_MIN_INTERVAL_MS = 60 * 60 * 1000;

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: { summary: { type: "STRING" } },
  required: ["summary"],
};

// Rewrites the user's cached humor summary when enough new likes/picks have
// come in since the last one (and at most hourly). Meant to run inside
// after(), so it never throws.
export async function refreshHumorSummary(userId: string, profile: HumorProfile) {
  const admin = createAdminClient();
  if (!admin || !profile.enough) return;

  try {
    const { data: existing } = await admin
      .from("humor_profiles")
      .select("likes_at_summary, picks_at_summary, updated_at, summary")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.summary) {
      const newSignals =
        profile.likedTagged + profile.picks -
        existing.likes_at_summary - existing.picks_at_summary;
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (newSignals < SUMMARY_MIN_NEW_SIGNALS || age < SUMMARY_MIN_INTERVAL_MS) {
        return;
      }
    }

    const facts = [
      ...profile.loves.map(
        (s) => `Likes ${s.liked} of ${s.inFeed} "${s.label}" memes (much more than average).`
      ),
      ...profile.notMine.map(
        (s) => `Likes only ${s.liked} of ${s.inFeed} "${s.label}" memes (less than average).`
      ),
      ...profile.pickStats.map(
        (s) => `When offered a ${s.label} caption, picks it ${s.chosen} of ${s.offered} times.`
      ),
    ];
    if (facts.length === 0) return;

    const result = await callGemini(
      [
        {
          text:
            "Write a playful 2-3 sentence description of this person's sense " +
            "of humor for a Columbia University meme board, addressed to them " +
            "as \"you\". Base it only on these facts; don't invent numbers.\n\n" +
            facts.join("\n"),
        },
      ],
      SUMMARY_SCHEMA
    );
    if ("error" in result) {
      console.error("Couldn't write humor summary:", result.error);
      return;
    }

    const summary = (result.json as { summary?: unknown }).summary;
    if (typeof summary !== "string" || !summary.trim()) return;

    const { error } = await admin.from("humor_profiles").upsert({
      user_id: userId,
      summary: summary.trim().slice(0, 600),
      likes_at_summary: profile.likedTagged,
      picks_at_summary: profile.picks,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Couldn't save humor summary", error);
    }
  } catch (error) {
    console.error("Humor summary failed", error);
  }
}
