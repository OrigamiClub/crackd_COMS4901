"use client";

import { useRef, useState, useTransition } from "react";
import { generateCaption } from "./actions";

// Image picker shared by the new and edit forms. Captions are written by
// Gemini from the chosen image; the text box only steers the joke (e.g.
// "make a joke about Lion Fund"). On the edit page, `crackId` lets it
// caption the existing image when no new file is picked.
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
  const [direction, setDirection] = useState("");
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
    formData.set("direction", direction);

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
          className="mt-1 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-black/10 file:bg-foreground file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
      </label>
      <textarea
        placeholder="Optional: steer the joke, e.g. “make a joke about Lion Fund”"
        rows={3}
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        maxLength={300}
        className="rounded-md border border-black/10 bg-white p-2"
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate || isPending}
        className="self-start rounded-full border border-black/10 bg-foreground px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Generating…" : "✨ Generate caption with AI"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <input type="hidden" name="text" value={text} />
      <p className="rounded-md border border-black/10 p-2 text-sm">
        {text || (
          <span className="opacity-60">
            Your AI caption will appear here.
          </span>
        )}
      </p>
    </>
  );
}
