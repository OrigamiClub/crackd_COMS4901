"use client";

import { useEffect, useState } from "react";

// Used until the picture's color is known, and for pictures we can't read
// (hosted elsewhere without CORS, or nearly gray).
const FALLBACK_COLORS = [
  "var(--foreground)",
  "var(--sage)",
  "var(--mustard)",
  "var(--plum)",
  "var(--title)",
];

// Only our own bucket sends CORS headers, so only its images can be sampled.
const OWN_IMAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

const SAMPLE_SIZE = 32;

// The picture's main color, toned so white text on it stays readable.
// Pixels are weighted by how vivid they are, so a green photo with a white
// sky reads as green instead of washed-out gray. Returns null for nearly
// gray pictures.
function tileColor(img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const weight = (max - min) / 255;
    r += data[i] * weight;
    g += data[i + 1] * weight;
    b += data[i + 2] * weight;
    total += weight;
  }
  if (total < SAMPLE_SIZE * SAMPLE_SIZE * 0.05) return null;

  const [h, s] = rgbToHueSaturation(r / total, g / total, b / total);
  const saturation = Math.min(Math.max(s, 35), 60);
  return `hsl(${Math.round(h)} ${Math.round(saturation)}% 38%)`;
}

function rgbToHueSaturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  if (delta === 0) return [0, 0];
  const lightness = (max + min) / 2;
  const s = delta / (1 - Math.abs(2 * lightness - 1));
  let h;
  if (max === r / 255) h = ((g - b) / 255 / delta) % 6;
  else if (max === g / 255) h = (b - r) / 255 / delta + 2;
  else h = (r - g) / 255 / delta + 4;
  return [(h * 60 + 360) % 360, s * 100];
}

// A crack's theme color: its picture's main color once sampled, or a
// palette color picked by id until then (and for pictures we can't read).
// Shared by feed tiles and anything that should match them.
export function useCrackColor(id: number, imgUrl: string | null) {
  const [color, setColor] = useState<string | null>(null);

  // Sample a separate CORS-enabled copy so the visible <img> never depends
  // on CORS working.
  useEffect(() => {
    if (!imgUrl?.startsWith(OWN_IMAGE_PREFIX)) return;
    const sample = new Image();
    sample.crossOrigin = "anonymous";
    sample.onload = () => {
      try {
        setColor(tileColor(sample));
      } catch {
        // Canvas was tainted after all; keep the fallback color.
      }
    };
    sample.src = imgUrl;
    return () => {
      sample.onload = null;
    };
  }, [imgUrl]);

  return color ?? FALLBACK_COLORS[id % FALLBACK_COLORS.length];
}
