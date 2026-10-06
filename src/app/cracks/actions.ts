"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

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
  const extension = photo.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: photo.type });

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

const CAPTION_PROMPT =
  "You write captions for a Columbia University / New York City meme board " +
  "called \"Cracking Jokes in the City of New York\". Write one short, funny " +
  "meme caption for this image. Reply with only the caption text — no quotes, " +
  "hashtags, or explanation.";

// Asks Gemini for a caption. The image is either a freshly chosen `photo`
// file or, on the edit page, the stored image of the user's own meme `id`.
// Returns an error message instead of throwing so the form can show it.
export async function generateCaption(
  formData: FormData
): Promise<{ caption: string } | { error: string }> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Caption generation isn't configured (GEMINI_API_KEY)." };
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

    const response = await fetch(crack.img_url);
    if (!response.ok) {
      return { error: "Couldn't load the current image." };
    }
    image = await response.blob();
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: image.type || "image/jpeg", data } },
          { text: CAPTION_PROMPT },
        ],
      },
    ],
  });

  let response: Response | null = null;
  for (const model of GEMINI_MODELS) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body,
      }
    );

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
