import "server-only";

// Tried in order; we move on to the next one when a model is overloaded
// (429/503) or out of quota. Free-tier keys get a separate daily allowance
// per model, so a longer list means more captions per day.
const CAPTION_MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

// Background work (crack tagging, humor summaries) only uses the Lite
// models, so it never spends the allowance captions depend on.
const BACKGROUND_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

// Stop trying further models after this long, so a bad spell fails with a
// message instead of hanging the form.
const GEMINI_DEADLINE_MS = 45 * 1000;

// Each model gets this long before we give up on it and try the next.
export const GEMINI_TIMEOUT_MS = 20 * 1000;
// Pause before the second pass through the model list.
const GEMINI_RETRY_DELAY_MS = 2 * 1000;

// Free-tier keys get a fixed number of requests per model per day; once
// that's spent, Gemini answers 429 with a per-day quota violation.
function isDailyQuotaError(body: string) {
  return body.includes("RESOURCE_EXHAUSTED") && body.includes("PerDay");
}

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

// Sends one request to Gemini and returns its reply parsed as JSON (shaped
// by `schema`, Gemini's OpenAPI-style response schema). `background` picks
// the models reserved for work no one is waiting on. Returns an error
// message instead of throwing so callers can show or log it.
export async function callGemini(
  parts: Part[],
  schema: object,
  { background = false }: { background?: boolean } = {}
): Promise<{ json: unknown } | { error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Gemini isn't configured (GEMINI_API_KEY)." };
  }

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  // Overloads are usually brief, so if every model is busy we wait a
  // moment and go through the list once more. A model whose daily quota is
  // used up won't recover today, and one Google has retired (404) won't
  // come back, so those are skipped from then on.
  const models = background ? BACKGROUND_MODELS : CAPTION_MODELS;
  const attempts = [...models, ...models];
  const deadline = Date.now() + GEMINI_DEADLINE_MS;
  const outOfQuota = new Set<string>();
  const skip = new Set<string>();
  let response: Response | null = null;
  let failure: { status: number; body: string } | null = null;
  for (const [i, model] of attempts.entries()) {
    if (skip.has(model)) continue;
    if (Date.now() > deadline) break;
    if (i === models.length) {
      await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    }
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        }
      );
    } catch (error) {
      // Timed out or network failure: try the next model.
      console.error(`Gemini ${model} request failed`, error);
      response = null;
      continue;
    }

    if (response.ok) break;

    failure = { status: response.status, body: await response.text() };
    console.error(`Gemini ${model} error`, failure.status, failure.body);
    response = null;
    if (failure.status === 429 && isDailyQuotaError(failure.body)) {
      outOfQuota.add(model);
      skip.add(model);
    } else if (failure.status === 404) {
      skip.add(model);
    } else if (failure.status !== 429 && failure.status !== 503) {
      break;
    }
  }

  if (!response) {
    if (outOfQuota.size > 0 && skip.size === models.length) {
      return {
        error: "The hamsters have used up today's Gemini allowance. Try again tomorrow.",
      };
    }
    if (failure?.status === 429 || failure?.status === 503) {
      return { error: "Gemini is swamped right now. Try again in a minute." };
    }
    return { error: "Gemini couldn't answer. Try again." };
  }

  const result = await response.json();
  const reply = result.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("");

  try {
    return { json: JSON.parse(reply ?? "") };
  } catch {
    console.error("Gemini returned non-JSON", reply);
    return { error: "Gemini gave a garbled answer. Try again." };
  }
}
