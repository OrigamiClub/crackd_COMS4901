"use client";

import { useRef, useState, useTransition } from "react";
import { generateCaption } from "./actions";

// Image picker + caption box shared by the new and edit forms, with a
// button that asks Gemini to write the caption from the chosen image.
// On the edit page, `crackId` lets it caption the existing image when no
// new file is picked.
export default function CrackFields({
  photoLabel,
  photoRequired = false,
  defaultText = "",
  crackId,
}: {
  photoLabel: string;
  photoRequired?: boolean;
  defaultText?: string;
  crackId?: number;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultText);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canGenerate = hasPhoto || crackId !== undefined;

  function handleGenerate() {
    const formData = new FormData();
    const photo = photoRef.current?.files?.[0];
    if (photo) {
      formData.set("photo", photo);
    } else if (crackId !== undefined) {
      formData.set("id", String(crackId));
    }

    setError(null);
    startTransition(async () => {
      const result = await generateCaption(formData);
      if ("caption" in result) {
        setText(result.caption);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <label className="text-sm">
        {photoLabel}
        <input
          ref={photoRef}
          type="file"
          name="photo"
          accept="image/*"
          required={photoRequired}
          onChange={(e) => setHasPhoto(!!e.target.files?.length)}
          className="mt-1 block w-full text-sm"
        />
      </label>
      <textarea
        name="text"
        placeholder="Caption"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="rounded-md border border-black/10 bg-white p-2"
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate || isPending}
        className="self-start text-sm underline disabled:opacity-50"
      >
        {isPending ? "Generating…" : "✨ Generate caption with AI"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </>
  );
}
