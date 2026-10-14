// Server-side checks for uploaded images. The browser's `accept="image/*"`
// and the file's claimed type can't be trusted, so we look at the first
// bytes to decide what the file really is.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { type: string; extension: string; matches: (b: Uint8Array) => boolean }[] = [
  {
    type: "image/jpeg",
    extension: "jpg",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: "image/png",
    extension: "png",
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: "image/gif",
    extension: "gif",
    matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    type: "image/webp",
    extension: "webp",
    // "RIFF" .... "WEBP"
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export type CheckedImage = { type: string; extension: string };

// Returns the real type of a JPEG/PNG/GIF/WebP image, or an error message
// for anything else (including SVG/HTML) or anything over 5MB.
export async function checkImage(
  file: Blob
): Promise<CheckedImage | { error: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Images must be 5MB or smaller." };
  }

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const match = SIGNATURES.find((s) => s.matches(head));

  if (!match) {
    return { error: "Please choose a JPG, PNG, GIF, or WebP image." };
  }

  return { type: match.type, extension: match.extension };
}

// Only images in our own crack bucket are fetched server-side, so a crack
// row edited to point elsewhere can't make the server request arbitrary
// URLs.
export const OWN_CRACK_IMAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cracks/`;

const FETCH_TIMEOUT_MS = 20 * 1000;

// Downloads and checks a stored crack image, ready to send to Gemini.
export async function fetchOwnCrackImage(
  url: string
): Promise<{ data: string; type: string } | { error: string }> {
  if (!url.startsWith(OWN_CRACK_IMAGE_PREFIX)) {
    return { error: "This picture is hosted elsewhere — choose it again to caption it." };
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    return { error: "Couldn't load the current image." };
  }

  const image = await response.blob();
  const checked = await checkImage(image);
  if ("error" in checked) {
    return checked;
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  return { data, type: checked.type };
}
