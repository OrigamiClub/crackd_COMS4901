"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { checkImage } from "@/lib/images";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const BUCKET = "cracks";
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;
// Only images in our own bucket are fetched server-side, so a crack row
// edited to point elsewhere can't make the server request arbitrary URLs.
const OWN_IMAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${PUBLIC_PREFIX}`;

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function uploadCrackImage(
  supabase: SupabaseClient,
  userId: string,
  photo: File
) {
  const checked = await checkImage(photo);
  if ("error" in checked) {
    throw new Error(checked.error);
  }

  const path = `${userId}/${crypto.randomUUID()}.${checked.extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: checked.type });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return publicUrl;
}

// Best-effort cleanup of an image we previously uploaded. Images hosted
// elsewhere (e.g. seeded rows) are left alone.
async function removeCrackImage(supabase: SupabaseClient, imgUrl: string | null) {
  const index = imgUrl?.indexOf(PUBLIC_PREFIX) ?? -1;
  if (!imgUrl || index === -1) {
    return;
  }

  const path = decodeURIComponent(imgUrl.slice(index + PUBLIC_PREFIX.length));
  await supabase.storage.from(BUCKET).remove([path]);
}

function getPhoto(formData: FormData) {
  const photo = formData.get("photo") as File | null;
  return photo && photo.size > 0 ? photo : null;
}

// Tried in order; we move on to the next one only when a model is
// overloaded (429/503), which happens often with the newest Flash.
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  "gemini-3.5-flash",
];

// Per-user caption limits, enforced with the caption_requests log.
const CAPTION_LIMITS = [
  { windowMs: 60 * 1000, max: 5, message: "Slow down — the hamsters need a minute." },
  { windowMs: 24 * 60 * 60 * 1000, max: 50, message: "The hamsters are done for today. Try again tomorrow." },
];

// Each model gets this long before we give up on it and try the next.
const GEMINI_TIMEOUT_MS = 20 * 1000;

const CAPTION_PROMPT =
  "You write captions for a Columbia University / New York City meme board " +
  "called \"Cracking Jokes in the City of New York\". Write one short, funny " +
  "meme caption for this image. Reply with only the caption text — no quotes, " +
  "hashtags, or explanation. The user has the option to provide additional direction afterward. If they do not, try to create a Columbia University-related caption of your own. Please don't be picky.";

// Asks Gemini for a caption. The image is either a freshly chosen `photo`
// file or, on the edit page, the stored image of the user's own meme `id`.
// An optional `direction` (e.g. "make a joke about Lion Fund") steers the
// joke. Returns an error message instead of throwing so the form can show it.
export async function generateCaption(
  formData: FormData
): Promise<{ caption: string } | { error: string }> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Caption generation isn't configured (GEMINI_API_KEY)." };
  }

  for (const limit of CAPTION_LIMITS) {
    const since = new Date(Date.now() - limit.windowMs).toISOString();
    const { count, error } = await supabase
      .from("caption_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);

    if (error) {
      console.error("Caption rate limit check failed", error);
      return { error: "Caption generation is unavailable right now." };
    }
    if ((count ?? 0) >= limit.max) {
      return { error: limit.message };
    }
  }

  let image: Blob | null = getPhoto(formData);

  if (!image) {
    const id = formData.get("id")?.toString();
    const { data: crack } = id
      ? await supabase
          .from("cracks")
          .select("img_url")
          .eq("id", id)
          .eq("creator_id", user.id)
          .maybeSingle()
      : { data: null };

    if (!crack?.img_url) {
      return { error: "Choose an image first." };
    }

    if (!crack.img_url.startsWith(OWN_IMAGE_PREFIX)) {
      return {
        error: "This picture is hosted elsewhere — choose it again to caption it.",
      };
    }

    const response = await fetch(crack.img_url, {
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { error: "Couldn't load the current image." };
    }
    image = await response.blob();
  }

  const checked = await checkImage(image);
  if ("error" in checked) {
    return checked;
  }

  const { error: logError } = await supabase
    .from("caption_requests")
    .insert({ user_id: user.id });
  if (logError) {
    console.error("Couldn't log caption request", logError);
    return { error: "Caption generation is unavailable right now." };
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");

  const direction = formData.get("direction")?.toString().trim().slice(0, 300);
  const prompt = direction
    ? `${CAPTION_PROMPT}\n\nThe poster's direction for the joke: ${direction}`
    : CAPTION_PROMPT;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: checked.type, data } },
          { text: prompt },
        ],
      },
    ],
  });

  let response: Response | null = null;
  for (const model of GEMINI_MODELS) {
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

    if (response.status !== 429 && response.status !== 503) {
      break;
    }
  }

  if (!response?.ok) {
    console.error("Gemini error", response?.status, await response?.text());
    return { error: "Gemini couldn't generate a caption. Try again." };
  }

  const result = await response.json();
  const caption = result.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!caption) {
    return { error: "Gemini didn't return a caption. Try again." };
  }

  return { caption };
}

export async function createCrack(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const text = formData.get("text")?.toString().trim() || null;
  const photo = getPhoto(formData);

  if (!photo) {
    throw new Error("Please choose an image.");
  }

  if (!text) {
    throw new Error("Generate a caption before posting.");
  }

  const imgUrl = await uploadCrackImage(supabase, user.id, photo);

  const { error } = await supabase
    .from("cracks")
    .insert({ text, img_url: imgUrl, creator_id: user.id });

  if (error) {
    await removeCrackImage(supabase, imgUrl);
    throw new Error(error.message);
  }

  revalidatePath("/");
  redirect("/");
}

export async function updateCrack(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const id = formData.get("id")?.toString();
  const text = formData.get("text")?.toString().trim() || null;
  const photo = getPhoto(formData);

  const { data: existing } = await supabase
    .from("cracks")
    .select("img_url")
    .eq("id", id)
    .eq("creator_id", user.id)
    .single();

  if (!existing) {
    throw new Error("Meme not found, or you don't own it.");
  }

  const updates: { text: string | null; img_url?: string } = { text };

  if (photo) {
    updates.img_url = await uploadCrackImage(supabase, user.id, photo);
  }

  const { data, error } = await supabase
    .from("cracks")
    .update(updates)
    .eq("id", id)
    .eq("creator_id", user.id)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Meme update didn't match any row — check RLS policies on public.cracks."
    );
  }

  if (updates.img_url) {
    await removeCrackImage(supabase, existing.img_url);
  }

  revalidatePath("/");
  redirect("/");
}

export async function deleteCrack(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const id = formData.get("id")?.toString();

  const { data, error } = await supabase
    .from("cracks")
    .delete()
    .eq("id", id)
    .eq("creator_id", user.id)
    .select("img_url");

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Meme delete didn't match any row — check RLS policies on public.cracks."
    );
  }

  await removeCrackImage(supabase, data[0].img_url);

  revalidatePath("/");
  redirect("/");
}

// Likes the meme if the user hasn't yet, otherwise removes their like.
export async function toggleLike(crackId: number) {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const { data: deleted, error: deleteError } = await supabase
    .from("likes")
    .delete()
    .eq("crack_id", crackId)
    .eq("liker", user.id)
    .select("crack_id");

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!deleted || deleted.length === 0) {
    const { error } = await supabase
      .from("likes")
      .insert({ crack_id: crackId, liker: user.id });

    // 23505 = already liked (e.g. a double click); that's fine.
    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  revalidatePath("/");
}
