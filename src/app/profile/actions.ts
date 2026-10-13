"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { checkImage } from "@/lib/images";

const AVATAR_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/`;

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const firstName = formData.get("first_name")?.toString().trim();
  const lastName = formData.get("last_name")?.toString().trim();
  const photo = formData.get("photo") as File | null;

  const updates: { first_name?: string; last_name?: string; profpic?: string } = {
    first_name: firstName,
    last_name: lastName,
  };

  let oldAvatarPath: string | null = null;

  if (photo && photo.size > 0) {
    const checked = await checkImage(photo);
    if ("error" in checked) {
      throw new Error(checked.error);
    }

    const { data: current } = await supabase
      .from("profiles")
      .select("profpic")
      .eq("id", user.id)
      .single();
    if (current?.profpic?.startsWith(AVATAR_PREFIX)) {
      oldAvatarPath = decodeURIComponent(
        current.profpic.slice(AVATAR_PREFIX.length)
      );
    }

    // A new name per upload, so browsers and the CDN don't keep showing a
    // cached copy of the previous photo.
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${checked.extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, photo, { contentType: checked.type });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    updates.profpic = publicUrl;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Profile update didn't match any row — check RLS policies on public.profiles."
    );
  }

  // Best-effort cleanup of the replaced photo.
  if (updates.profpic && oldAvatarPath) {
    await supabase.storage.from("avatars").remove([oldAvatarPath]);
  }

  revalidatePath("/profile");
  revalidatePath("/");
}
