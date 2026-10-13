"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { generateCaption } from "./actions";
import Step from "./step";

const COPY = {
  new: {
    picture: "Choose a cracking picture",
    pictureHint: "Any image up to 5MB.",
    caption: "Let our patented team of hamsters generate a caption",
    submit: "Inflict your progeny upon the world",
    submitButton: "Inflict it",
    submitPending: "Inflicting…",
  },
  edit: {
    picture: "Swap the picture (optional)",
    pictureHint: "Leave this alone to keep the current picture.",
    caption: "Re-hamster the caption",
    submit: "Save your crack",
    submitButton: "Save",
    submitPending: "Saving…",
  },
};

// The three-step form body shared by the new and edit pages: pick a
// picture, have Gemini write the caption (the text box only steers the
// joke, e.g. "make a joke about Lion Fund"), then submit. On the edit page,
// `crackId` lets it caption the existing image when no new file is picked.
// Must be rendered inside the page's <form>.
export default function CrackFields({
  defaultText = "",
  defaultImageUrl,
  crackId,
}: {
  defaultText?: string;
  defaultImageUrl?: string | null;
  crackId?: number;
}) {
  const isEdit = crackId !== undefined;
  const copy = isEdit ? COPY.edit : COPY.new;

  const photoRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultText);
  const [direction, setDirection] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Free the object URL for the previous preview when it changes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const hasPicture = previewUrl !== null || isEdit;
  const shownImage = previewUrl ?? defaultImageUrl;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const photo = e.target.files?.[0];
    setPreviewUrl(photo ? URL.createObjectURL(photo) : null);
    // A caption written for the old picture no longer fits a new one.
    if (!isEdit) setText("");
  }

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
      <Step
        number={1}
        badgeClass="bg-foreground"
        title={copy.picture}
        hint={copy.pictureHint}
      >
        <input
          ref={photoRef}
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/gif,image/webp"
          required={!isEdit}
          aria-label={copy.picture}
          onChange={handlePhotoChange}
          className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-black/10 file:bg-foreground file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {shownImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownImage}
            alt="Selected picture"
            className="aspect-square w-full max-w-xs rounded-lg object-cover"
          />
        )}
      </Step>

      <Step
        number={2}
        badgeClass="bg-sage"
        title={copy.caption}
        hint="Optional: tell the hamsters what to joke about."
        locked={!hasPicture}
        lockedHint="Pick a picture first — the hamsters need something to look at."
      >
        <textarea
          placeholder="e.g. “make a joke about Lion Fund”"
          rows={2}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          maxLength={300}
          disabled={!hasPicture}
          aria-label="Direction for the caption"
          className="rounded-md border border-black/10 bg-white p-2"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasPicture || isPending}
          className="self-start rounded-full border border-black/10 bg-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending
            ? "Hamsters are typing…"
            : text
              ? "🐹 Try another caption"
              : "🐹 Unleash the hamsters"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <input type="hidden" name="text" value={text} />
        <p className="rounded-md border border-black/10 p-2 text-sm" aria-live="polite">
          {text || (
            <span className="opacity-60">Your caption will appear here.</span>
          )}
        </p>
      </Step>

      <Step
        number={3}
        badgeClass="bg-title"
        title={copy.submit}
        locked={!text}
        lockedHint="Get a caption from the hamsters first."
      >
        <SubmitButton
          disabled={!text || isPending}
          label={copy.submitButton}
          pendingLabel={copy.submitPending}
        />
      </Step>
    </>
  );
}

function SubmitButton({
  disabled,
  label,
  pendingLabel,
}: {
  disabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="self-start rounded-full border border-black/10 bg-title px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
