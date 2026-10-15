"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { checkImage, fetchOwnCrackImage } from "@/lib/images";
import { callGemini } from "@/lib/gemini";
import { tagCracks, type CaptionOption } from "@/lib/humor";
import { STYLES, STYLE_KEYS } from "@/lib/humor-vocab";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const BUCKET = "cracks";
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

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

// Per-user caption limits, enforced with the caption_requests log.
const CAPTION_LIMITS = [
  { windowMs: 60 * 1000, max: 5, message: "Slow down — the hamsters need a minute." },
  { windowMs: 24 * 60 * 60 * 1000, max: 50, message: "The hamsters are done for today. Try again tomorrow." },
];

const CAPTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      caption: { type: "STRING" },
      style: { type: "STRING", enum: STYLE_KEYS },
    },
    required: ["caption", "style"],
  },
};

const CAPTION_PROMPT =
  "You write captions for a Columbia University / New York City meme board " +
  "called \"Cracking Jokes in the City of New York\". Write three short, " +
  "funny meme captions for this image, each in a clearly different style of " +
  `humor, chosen from: ${STYLES.map((s) => `${s.key} (${s.label})`).join(", ")}. ` +
  "For each, give the caption and the style key it uses — no quotes " +
  "inside the captions, hashtags, or explanation. The user has the option to provide additional direction afterward. If they do not, try to create a Columbia University-related caption of your own. Please don't be picky.";

// Asks Gemini for three captions to choose from. The image is either a freshly chosen `photo`
// file or, on the edit page, the stored image of the user's own meme `id`.
// An optional `direction` (e.g. "make a joke about Lion Fund") steers the
// joke. Each caption comes with its humor style. The request is logged in
// caption_requests with its options, and its
// id comes back so the form can report which option was picked (see
// recordCaptionChoice). Returns an error message instead of throwing so the
// form can show it.
export async function generateCaption(
  formData: FormData
): Promise<{ captions: CaptionOption[]; requestId: number } | { error: string }> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  if (!process.env.GEMINI_API_KEY) {
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

  let image: { data: string; type: string };
  const photo = getPhoto(formData);

  if (photo) {
    const checked = await checkImage(photo);
    if ("error" in checked) {
      return checked;
    }
    image = {
      data: Buffer.from(await photo.arrayBuffer()).toString("base64"),
      type: checked.type,
    };
  } else {
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

    const fetched = await fetchOwnCrackImage(crack.img_url);
    if ("error" in fetched) {
      return fetched;
    }
    image = fetched;
  }

  const direction = formData.get("direction")?.toString().trim().slice(0, 300);

  const { data: logged, error: logError } = await supabase
    .from("caption_requests")
    .insert({ user_id: user.id, direction: direction || null })
    .select("id")
    .single();
  if (logError || !logged) {
    console.error("Couldn't log caption request", logError);
    return { error: "Caption generation is unavailable right now." };
  }

  const prompt = direction
    ? `${CAPTION_PROMPT}\n\nThe poster's direction for the joke: ${direction}`
    : CAPTION_PROMPT;

  const result = await callGemini(
    [
      { inline_data: { mime_type: image.type, data: image.data } },
      { text: prompt },
    ],
    CAPTION_SCHEMA
  );
  if ("error" in result) {
    return result;
  }

  const captions: CaptionOption[] = (Array.isArray(result.json) ? result.json : [])
    .map((item: { caption?: unknown; style?: unknown }) => ({
      caption: typeof item?.caption === "string" ? item.caption.trim() : "",
      style:
        typeof item?.style === "string" && STYLE_KEYS.includes(item.style)
          ? item.style
          : null,
    }))
    .filter((option) => option.caption)
    .slice(0, 3);

  if (captions.length === 0) {
    return { error: "Gemini didn't return any captions. Try again." };
  }

  // Saved with the service-role key: users can't write options themselves,
  // so they can't make up what they were offered.
  const admin = createAdminClient();
  const { error: optionsError } = admin
    ? await admin
        .from("caption_requests")
        .update({ options: captions })
        .eq("id", logged.id)
    : { error: "SUPABASE_SERVICE_ROLE_KEY isn't set" };
  if (optionsError) {
    console.error("Couldn't save caption options", optionsError);
  }

  return { captions, requestId: logged.id };
}

// Marks which generated option ended up on a saved crack, for later humor
// analysis. Best-effort: a failure here shouldn't block posting.
async function recordCaptionChoice(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData,
  crackId: number
) {
  const requestId = Number(formData.get("caption_request_id"));
  const chosenIndex = Number(formData.get("caption_choice"));
  if (
    !Number.isInteger(requestId) ||
    requestId <= 0 ||
    ![0, 1, 2].includes(chosenIndex)
  ) {
    return;
  }

  const { error } = await supabase
    .from("caption_requests")
    .update({ chosen_index: chosenIndex, crack_id: crackId })
    .eq("id", requestId)
    .eq("user_id", userId);
  if (error) {
    console.error("Couldn't record caption choice", error);
  }
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

  const { data: created, error } = await supabase
    .from("cracks")
    .insert({ text, img_url: imgUrl, creator_id: user.id })
    .select("id")
    .single();

  if (error || !created) {
    await removeCrackImage(supabase, imgUrl);
    throw new Error(error?.message ?? "Couldn't save the crack.");
  }

  await recordCaptionChoice(supabase, user.id, formData, created.id);
  after(() => tagCracks({ ids: [created.id] }));

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

  await recordCaptionChoice(supabase, user.id, formData, data[0].id);
  after(() => tagCracks({ ids: [data[0].id] }));

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
