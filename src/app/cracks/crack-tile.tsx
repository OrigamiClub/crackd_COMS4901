"use client";

import Link from "next/link";
import { useCrackColor } from "./crack-color";
import LikeButton from "./like-button";

// One crack in the home feed: colored to match its picture, slightly
// tilted (straightens on hover), and fading in after the tiles before it.
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

  // A fixed tilt between -2.5° and 2.5° per crack, so it doesn't jump around.
  const tilt = ((id * 37) % 5 - 2) * 1.25;

  return (
    <figure
      style={
        {
          "--i": index,
          "--tilt": `${tilt}deg`,
          backgroundColor: color,
        } as React.CSSProperties
      }
      className="cascade-in flex rotate-(--tilt) flex-col overflow-hidden rounded-lg border border-black/10 text-white transition-[background-color,rotate,translate,box-shadow] duration-500 hover:rotate-0 hover:shadow-xl motion-safe:hover:-translate-y-1 dark:border-white/15"
    >
      {imgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl}
          alt={text ?? ""}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      )}
      {text && <figcaption className="p-3 text-sm">{text}</figcaption>}
      <div className="mt-auto flex items-center justify-between px-3 pb-3">
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
