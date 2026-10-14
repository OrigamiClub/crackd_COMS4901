"use client";

import { useCrackColor } from "./crack-color";

// A bordered panel tinted with a crack's theme color, so it matches that
// crack's tile in the feed. Children can use the color via `text-(--tint)`.
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
      className={`rounded-lg border transition-colors duration-500 ${className}`}
      style={
        {
          "--tint": color,
          backgroundColor: `color-mix(in srgb, ${color} 22%, var(--background))`,
          borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
        } as React.CSSProperties
      }
    >
      {children}
    </section>
  );
}
