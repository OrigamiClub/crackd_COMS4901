"use client";

import { useCrackColor } from "./crack-color";

// A bordered panel with a crack's theme color as an accent edge, so it
// matches that crack's tile in the feed without competing with it.
// Children can use the color via `text-(--tint)`.
export default function CrackTint({
  crackId,
  imgUrl,
  className = "",
  children,
}: {
  crackId: number;
  imgUrl: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const color = useCrackColor(crackId, imgUrl);
  return (
    <section
      className={`rounded-xl border border-l-4 border-black/10 bg-surface transition-colors duration-500 dark:border-white/15 ${className}`}
      style={{ "--tint": color, borderLeftColor: color } as React.CSSProperties}
    >
      {children}
    </section>
  );
}
