"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toggleLike } from "./actions";

// Little hearts that float off when liking: horizontal drift for each.
const BURST = ["-14px", "-6px", "4px", "13px"];

// Heart + like count for one meme. Updates instantly on click, then the
// server action's revalidation brings in the real count. Liking makes the
// heart pop and a few small hearts float away. Logged-out users see the
// count and a link to log in.
export default function LikeButton({
  crackId,
  count,
  liked,
  loggedIn,
}: {
  crackId: number;
  count: number;
  liked: boolean;
  loggedIn: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    { count, liked },
    (state) => ({
      liked: !state.liked,
      count: state.count + (state.liked ? -1 : 1),
    })
  );
  const [, startTransition] = useTransition();
  // Bumped on each like so the pop and burst animations restart.
  const [burst, setBurst] = useState(0);

  const label = `${optimistic.count} ${optimistic.count === 1 ? "like" : "likes"}`;
  const className = "flex items-center gap-1 text-sm";

  if (!loggedIn) {
    return (
      <Link href="/login" className={className} title="Log in to like">
        <span aria-hidden>♡</span>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!optimistic.liked) setBurst((n) => n + 1);
        startTransition(async () => {
          setOptimistic(null);
          await toggleLike(crackId);
        });
      }}
      aria-pressed={optimistic.liked}
      className={className}
    >
      <span aria-hidden className="relative inline-block">
        <span
          key={burst}
          className={`inline-block ${
            optimistic.liked ? "text-primary" : ""
          } ${burst > 0 ? "motion-safe:animate-[heart-pop_300ms_ease-out]" : ""}`}
        >
          {optimistic.liked ? "♥" : "♡"}
        </span>
        {burst > 0 &&
          BURST.map((dx, i) => (
            <span
              key={`${burst}-${i}`}
              style={
                { "--dx": dx, animationDelay: `${i * 40}ms` } as React.CSSProperties
              }
              className="pointer-events-none absolute top-0 left-0 text-xs text-primary opacity-0 motion-safe:animate-[heart-float_600ms_ease-out_backwards]"
            >
              ♥
            </span>
          ))}
      </span>
      {label}
    </button>
  );
}
