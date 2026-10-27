import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Logs each run of an AI prompt chain (generation_requests) and every
// model attempt inside it (llm_responses), for the admin area. All
// best-effort: if the tables aren't there yet or a write fails, the error
// goes to the console and the feature carries on unlogged.

export type ChainSlug = "caption" | "tag" | "humor-summary";

export type Generation = {
  db: SupabaseClient;
  id: number;
  // The chain's model-calling step, which llm_responses point at.
  stepId: number | null;
};

// Long enough for any reply we ask for; keeps a runaway one out of the log.
const MAX_LOGGED_TEXT = 20_000;

export async function startGeneration(
  db: SupabaseClient | null,
  run: {
    chain: ChainSlug;
    source: "meme-board" | "admin";
    userId?: string | null;
    crackId?: number | null;
    captionRequestId?: number | null;
    prompt: string;
    hasImage: boolean;
  }
): Promise<Generation | null> {
  if (!db) return null;

  try {
    const { data: chain } = await db
      .from("prompt_chains")
      .select("id, prompt_chain_steps (id, calls_model)")
      .eq("slug", run.chain)
      .maybeSingle();

    const { data, error } = await db
      .from("generation_requests")
      .insert({
        chain_id: chain?.id ?? null,
        source: run.source,
        user_id: run.userId ?? null,
        crack_id: run.crackId ?? null,
        caption_request_id: run.captionRequestId ?? null,
        prompt: run.prompt.slice(0, MAX_LOGGED_TEXT),
        has_image: run.hasImage,
        // Same clock as finished_at, so the run's duration is right even
        // when the server's clock and the database's disagree.
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Couldn't log generation request", error);
      return null;
    }

    const steps: { id: number; calls_model: boolean }[] = chain?.prompt_chain_steps ?? [];
    return { db, id: data.id, stepId: steps.find((s) => s.calls_model)?.id ?? null };
  } catch (error) {
    console.error("Couldn't log generation request", error);
    return null;
  }
}

export async function logAttempt(
  generation: Generation | null | undefined,
  attempt: {
    model: string;
    modelId: number | null;
    attempt: number;
    httpStatus: number | null;
    ok: boolean;
    responseText?: string | null;
    error?: string | null;
    latencyMs: number;
  }
) {
  if (!generation) return;

  const { error } = await generation.db.from("llm_responses").insert({
    generation_request_id: generation.id,
    step_id: generation.stepId,
    model_id: attempt.modelId,
    api_model: attempt.model,
    attempt: attempt.attempt,
    http_status: attempt.httpStatus,
    ok: attempt.ok,
    response_text: attempt.responseText?.slice(0, MAX_LOGGED_TEXT) ?? null,
    error: attempt.error?.slice(0, 2000) ?? null,
    latency_ms: attempt.latencyMs,
  });
  if (error) {
    console.error("Couldn't log LLM response", error);
  }
}

// Marks the run done; pass the user-facing error message when it failed.
export async function finishGeneration(
  generation: Generation | null | undefined,
  error?: string
) {
  if (!generation) return;

  const { error: updateError } = await generation.db
    .from("generation_requests")
    .update({
      status: error ? "failed" : "succeeded",
      error: error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", generation.id);
  if (updateError) {
    console.error("Couldn't finish generation request", updateError);
  }
}
