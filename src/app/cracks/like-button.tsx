"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toggleLike } from "./actions";

// Little hearts that float off when liking: horizontal drift for each.
const BURST = ["-14px", "-6px", "4px", "13px"];

// The like control for one joke: a pill that reads "Like" (outlined) or
// "Liked" (filled), with the count beside it, so the state is clear at a
// glance. Updates instantly on click, then the server action's revalidation
// brings in the real count. Liking makes the heart pop and a few small
// hearts float away. Logged-out users get the same pill linking to login.
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

  const countLabel = `${optimistic.count} ${optimistic.count === 1 ? "like" : "likes"}`;
  const pill =
    "btn-pop flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium";
  const countText = <span className="text-sm opacity-75">{countLabel}</span>;

  if (!loggedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className={`${pill} border-foreground/40`} title="Log in to like jokes">
          <span aria-hidden>♡</span>
          Like
        </Link>
        {countText}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
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
        title={optimistic.liked ? "Take your like back" : "Like this joke"}
        className={`${pill} ${
          optimistic.liked
            ? "border-primary bg-primary text-white"
            : "border-foreground/40 hover:border-primary hover:text-primary"
        }`}
      >
        <span aria-hidden className="relative inline-block">
          <span
            key={burst}
            className={`inline-block ${
              burst > 0 ? "motion-safe:animate-[heart-pop_300ms_ease-out]" : ""
            }`}
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
        {optimistic.liked ? "Liked" : "Like"}
      </button>
      {countText}
    </div>
  );
}
