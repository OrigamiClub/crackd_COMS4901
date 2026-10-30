"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { generateCaption } from "./actions";
import type { CaptionOption } from "@/lib/humor";
import { styleInfo } from "@/lib/humor-vocab";
import { IMAGE_TOO_BIG, MAX_IMAGE_BYTES } from "@/lib/images";
import Step from "./step";

const COPY = {
  new: {
    picture: "Choose a photo",
    pictureHint: "Any image up to 4MB.",
    caption: "Get caption ideas from our AI hamsters",
    submit: "Post your joke",
    submitButton: "Post joke",
    submitPending: "Posting…",
  },
  edit: {
    picture: "Swap the picture (optional)",
    pictureHint: "Leave this alone to keep the current picture.",
    caption: "Get new caption ideas (optional)",
    submit: "Save your joke",
    submitButton: "Save",
    submitPending: "Saving…",
  },
};

// The three-step form body shared by the new and edit pages: pick a
// picture, have Gemini write three captions and pick one (the text box only
// steers the joke, e.g. "make a joke about Lion Fund"), then submit. The
// pick is sent along with the form so it can feed the humor profile. On the edit page,
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
  // The latest batch of options, and which request/option the current
  // caption came from (null when it wasn't picked from a batch).
  const [options, setOptions] = useState<CaptionOption[]>([]);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [choice, setChoice] = useState<{
    requestId: number;
    index: number;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
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
    let photo = e.target.files?.[0];
    // Catch oversized files here; the server would only reject them
    // after the whole upload.
    if (photo && photo.size > MAX_IMAGE_BYTES) {
      e.target.value = "";
      photo = undefined;
      setPhotoError(IMAGE_TOO_BIG);
    } else {
      setPhotoError(null);
    }
    setPreviewUrl(photo ? URL.createObjectURL(photo) : null);
    // Captions written for the old picture no longer fit a new one.
    setOptions([]);
    setRequestId(null);
    if (!isEdit) {
      setText("");
      setChoice(null);
    }
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
      if ("captions" in result) {
        setOptions(result.captions);
        setRequestId(result.requestId);
      } else {
        setError(result.error);
      }
    });
  }

  function handlePick(index: number) {
    if (requestId === null) return;
    setText(options[index].caption);
    setChoice({ requestId, index });
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
        {photoError && <p className="text-sm text-red-700">{photoError}</p>}
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
          className="input"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasPicture || isPending}
          className="btn-secondary self-start disabled:opacity-50"
        >
          {isPending ? (
            <HamsterStatus />
          ) : options.length > 0 || text ? (
            "🐹 Try three more"
          ) : (
            "🐹 Unleash the hamsters"
          )}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {options.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Pick a caption"
            className="flex flex-col gap-2"
          >
            {options.map((option, index) => {
              const picked =
                choice?.requestId === requestId && choice?.index === index;
              return (
                <button
                  key={`${requestId}-${index}`}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  onClick={() => handlePick(index)}
                  style={{ "--i": index * 2 } as React.CSSProperties}
                  className={`cascade-in flex items-start justify-between gap-3 rounded-lg border p-2 text-left text-sm transition-colors ${
                    picked
                      ? "border-sage bg-sage text-white"
                      : "border-black/10 bg-white hover:border-sage dark:border-white/15 dark:bg-white/10"
                  }`}
                >
                  <span>{option.caption}</span>
                  {option.style && (
                    <StyleChip style={option.style} />
                  )}
                </button>
              );
            })}
          </div>
        )}
        <input type="hidden" name="text" value={text} />
        <input
          type="hidden"
          name="caption_request_id"
          value={choice?.requestId ?? ""}
        />
        <input type="hidden" name="caption_choice" value={choice?.index ?? ""} />
        <p className="rounded-lg border border-black/15 p-2 text-sm dark:border-white/20" aria-live="polite">
          {text || (
            <span className="opacity-60">
              {options.length > 0
                ? "Pick one of the captions above."
                : "Your caption will appear here."}
            </span>
          )}
        </p>
      </Step>

      <Step
        number={3}
        badgeClass="bg-title"
        title={copy.submit}
        locked={!text}
        lockedHint="Get captions from the hamsters and pick one first."
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

// Small colored label for a caption's humor style.
function StyleChip({ style }: { style: string }) {
  const info = styleInfo(style);
  if (!info) return null;
  return (
    <span
      style={{ backgroundColor: info.color }}
      className="shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-white"
    >
      {info.label}
    </span>
  );
}

const HAMSTER_STATUSES = [
  "Hamsters are typing…",
  "Hamsters are arguing…",
  "Hamsters are consulting the Core…",
  "Hamsters are workshopping…",
  "Hamsters are laughing at their own jokes…",
];

// Rotating progress message while Gemini works, with a bouncing hamster.
function HamsterStatus() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((n) => n + 1), 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="inline-block motion-safe:animate-bounce">
        🐹
      </span>
      {HAMSTER_STATUSES[step % HAMSTER_STATUSES.length]}
    </span>
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
      className="btn-primary self-start disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
