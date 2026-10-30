"use client";

import { useState } from "react";
import Link from "next/link";
import { useCrackColor } from "./crack-color";
import LikeButton from "./like-button";

// Captions longer than this get clamped with a "Show more" link.
const LONG_CAPTION = 110;

// One joke in the home feed: a card with a strip of its picture's color
// along the top, a square picture (or, for text-only jokes, the caption on
// a square of that color), the caption (long ones clamped to three lines
// with Show more), and the like control. The poster's own jokes say so and
// get an Edit button. Fades in after the tiles before it.
export default function CrackTile({
  id,
  text,
  imgUrl,
  index,
  likeCount,
  liked,
  loggedIn,
  canEdit,
}: {
  id: number;
  text: string | null;
  imgUrl: string | null;
  index: number;
  likeCount: number;
  liked: boolean;
  loggedIn: boolean;
  canEdit: boolean;
}) {
  const color = useCrackColor(id, imgUrl);
  const [expanded, setExpanded] = useState(false);

  return (
    <figure
      style={{ "--i": index } as React.CSSProperties}
      className="crack-card cascade-in flex flex-col transition-[translate,box-shadow] duration-300 hover:shadow-lg motion-safe:hover:-translate-y-1"
    >
      <div
        aria-hidden
        className="h-1 shrink-0 transition-colors duration-500"
        style={{ backgroundColor: color }}
      />
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl}
          alt={text ?? ""}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="flex aspect-square items-center justify-center p-6 text-white transition-colors duration-500"
          style={{ backgroundColor: color }}
        >
          <p className="heading line-clamp-6 text-center text-xl">{text}</p>
        </div>
      )}
      {text && imgUrl && (
        <figcaption className="flex flex-col items-start gap-1 px-4 pt-3 text-sm">
          <p className={expanded ? "" : "line-clamp-3"}>{text}</p>
          {text.length > LONG_CAPTION && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="text-xs font-medium underline opacity-75 hover:opacity-100"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </figcaption>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-4">
        <LikeButton
          crackId={id}
          count={likeCount}
          liked={liked}
          loggedIn={loggedIn}
        />
        {canEdit && (
          <span className="flex items-center gap-2">
            <span className="text-xs opacity-75">Your joke</span>
            <Link
              href={`/cracks/${id}/edit`}
              className="btn-pop flex h-8 items-center rounded-full border border-foreground/40 px-3 text-sm font-medium"
            >
              Edit
            </Link>
          </span>
        )}
      </div>
    </figure>
  );
}
