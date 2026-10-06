"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleLike } from "./actions";

// Heart + like count for one meme. Updates instantly on click, then the
// server action's revalidation brings in the real count. Logged-out users
// see the count and a link to log in.
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
      onClick={() =>
        startTransition(async () => {
          setOptimistic(null);
          await toggleLike(crackId);
        })
      }
      aria-pressed={optimistic.liked}
      className={className}
    >
      <span aria-hidden className={optimistic.liked ? "text-red-600" : ""}>
        {optimistic.liked ? "♥" : "♡"}
      </span>
      {label}
    </button>
  );
}
