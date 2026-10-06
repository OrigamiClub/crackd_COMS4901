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
