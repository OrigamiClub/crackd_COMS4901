"use client";

import { useState } from "react";
import Link from "next/link";
import { useCrackColor } from "./crack-color";
import LikeButton from "./like-button";

// One crack in the home feed: a card with a strip of its picture's color
// along the top, a square picture (or, for text-only cracks, the caption
// on a square of that color), and a caption clamped to three lines that
// opens in full on click. Fades in after the tiles before it.
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
        <figcaption className="px-4 pt-3 text-sm">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className={`text-left ${expanded ? "" : "line-clamp-3"}`}
          >
            {text}
          </button>
        </figcaption>
      )}
      <div className="mt-auto flex items-center justify-between px-4 pt-3 pb-4">
        <LikeButton
          crackId={id}
          count={likeCount}
          liked={liked}
          loggedIn={loggedIn}
        />
        {canEdit && (
          <Link href={`/cracks/${id}/edit`} className="text-sm underline">
            Edit
          </Link>
        )}
      </div>
    </figure>
  );
}
