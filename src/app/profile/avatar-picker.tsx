"use client";

import { useEffect, useState } from "react";
import { IMAGE_TOO_BIG, MAX_IMAGE_BYTES } from "@/lib/images";

// Large round profile photo that doubles as the file picker: clicking it
// opens the chooser, and the new photo previews before the form is saved.
export default function AvatarPicker({
  currentUrl,
}: {
  currentUrl: string | null;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Free the object URL for the previous preview when it changes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shown = previewUrl ?? currentUrl;

  return (
    <div className="flex flex-col items-center gap-2 self-center">
      <label className="group relative h-40 w-40 cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-title focus-within:ring-offset-2">
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/gif,image/webp"
          aria-label="Change profile photo"
          onChange={(e) => {
            let photo = e.target.files?.[0];
            if (photo && photo.size > MAX_IMAGE_BYTES) {
              e.target.value = "";
              photo = undefined;
              setPhotoError(IMAGE_TOO_BIG);
            } else {
              setPhotoError(null);
            }
            setPreviewUrl(photo ? URL.createObjectURL(photo) : null);
          }}
          className="sr-only"
        />
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            className="h-full w-full rounded-full border border-black/10 object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full border border-black/10 bg-foreground text-6xl">
            🐹
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          Change photo
        </span>
        <span
          aria-hidden
          className="absolute right-1 bottom-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-title text-lg"
        >
          📷
        </span>
      </label>
      {photoError && <p className="text-sm text-red-700">{photoError}</p>}
    </div>
  );
}
