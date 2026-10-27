import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STYLE_KEYS } from "@/lib/humor-vocab";

// What admins tune about the caption prompt: campus terms to explain to
// Gemini, example captions, and the style mix (how often each humor style
// is asked for). Read with the service-role key on the meme board and as
// the admin in the admin area. Missing tables just mean no extras.

export type CaptionSettings = {
  terms: { term: string; definition: string }[];
  examples: { situation: string; caption: string; style: string | null }[];
  mix: { style: string; weight: number }[];
};

// Keeps the prompt a reasonable size however many rows admins add.
const MAX_TERMS = 40;
const MAX_EXAMPLES = 8;

export async function loadCaptionSettings(
  db: SupabaseClient | null
): Promise<CaptionSettings> {
  if (!db) return { terms: [], examples: [], mix: [] };

  const [terms, examples, mix] = await Promise.all([
    db.from("terms").select("term, definition").order("term").limit(MAX_TERMS),
    db
      .from("ai_generation_examples")
      .select("situation, caption, style")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(MAX_EXAMPLES),
    db
      .from("prompt_chain_mix")
      .select("style, weight, prompt_chains!inner (slug)")
      .eq("prompt_chains.slug", "caption")
      .gt("weight", 0),
  ]);
  for (const [what, result] of [["terms", terms], ["examples", examples], ["style mix", mix]] as const) {
    if (result.error) console.error(`Couldn't load caption ${what}`, result.error);
  }

  return {
    terms: terms.data ?? [],
    examples: examples.data ?? [],
    mix: (mix.data ?? []).filter((m) => STYLE_KEYS.includes(m.style)),
  };
}

// Up to three different styles, each drawn with probability proportional
// to its weight. Empty when every weight is 0, which leaves it to Gemini.
export function pickStyles(mix: CaptionSettings["mix"]) {
  const pool = [...mix];
  const picked: string[] = [];
  while (picked.length < 3 && pool.length > 0) {
    let roll = Math.random() * pool.reduce((sum, m) => sum + m.weight, 0);
    const index = pool.findIndex((m) => (roll -= m.weight) < 0);
    picked.push(pool.splice(index === -1 ? pool.length - 1 : index, 1)[0].style);
  }
  return picked;
}

// The base caption prompt with the admin-tuned extras appended.
export function captionPrompt(base: string, settings: CaptionSettings) {
  const parts = [base];

  const styles = pickStyles(settings.mix);
  if (styles.length > 0) {
    parts.push(
      `Use these styles, in this order: ${styles.join(", ")}` +
        (styles.length < 3 ? ". Pick different styles for the rest." : ".")
    );
  }
  if (settings.terms.length > 0) {
    parts.push(
      "Campus terms you can use when they fit:\n" +
        settings.terms.map((t) => `- ${t.term}: ${t.definition}`).join("\n")
    );
  }
  if (settings.examples.length > 0) {
    parts.push(
      "Captions that went over well before, for tone only (don't reuse them):\n" +
        settings.examples
          .map((e) => `- ${e.style ? `[${e.style}] ` : ""}${e.situation} → ${e.caption}`)
          .join("\n")
    );
  }

  return parts.join("\n\n");
}
