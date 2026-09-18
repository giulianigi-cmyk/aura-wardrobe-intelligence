/** Shared outfit-canvas composition — the SAME auto-placement logic
 *  OutfitBuilder.tsx uses (bucket-by-category, slight rotation/offset
 *  per bucket for a styled flat-lay look rather than a rigid stack —
 *  see OutfitBuilder.tsx for the full reasoning), extracted here so
 *  Home.tsx's "Today's Edit" and curated looks can compose the SAME
 *  kind of real outfit image instead of showing a plain grid of
 *  separate item photos.
 *
 *  Deliberately implemented with the plain Canvas 2D API
 *  (drawImage/rotate/translate) rather than OutfitBuilder's
 *  html-to-image approach: html-to-image clones a live, mounted DOM
 *  node, which Home's background composition doesn't have (it composes
 *  right after generating a suggestion, with nothing shown on screen
 *  yet) — a plain canvas draws directly from image data with no DOM
 *  dependency at all, which is what makes composing "headlessly" like
 *  this possible in the first place.
 */
import { supabase } from "@/integrations/supabase/client";

export type Bucket = "top" | "bottom" | "dress" | "shoes" | "outer" | "acc";

const LAYOUT_Y: Record<Bucket, number> = { outer: 0.30, top: 0.36, dress: 0.48, bottom: 0.57, shoes: 0.82, acc: 0.40 };
const LAYOUT_X: Record<Bucket, number> = { outer: 0.62, top: 0.47, dress: 0.5, bottom: 0.51, shoes: 0.40, acc: 0.76 };
const LAYOUT_ROTATION: Record<Bucket, number> = { outer: -6, top: -2, dress: 0, bottom: 2, shoes: 7, acc: -5 };
const Z_BY_BUCKET: Record<Bucket, number> = { outer: 2, top: 3, dress: 3, bottom: 2, shoes: 1, acc: 4 };

export function bucketOf(category: string | null, style: unknown): Bucket {
  const c = `${category ?? ""} ${Array.isArray(style) ? style.join(" ") : style ?? ""}`.toLowerCase();
  if (/dress|gown|jumpsuit/.test(c)) return "dress";
  if (/shoe|boot|sneaker|sandal|loafer|heel/.test(c)) return "shoes";
  if (/pant|trouser|jean|short|skirt|bottom/.test(c)) return "bottom";
  if (/coat|jacket|blazer|outerwear/.test(c)) return "outer";
  if (/shirt|top|tee|blouse|knit|sweater/.test(c)) return "top";
  return "acc";
}

export type ComposeItem = { id: string; imgUrl: string; category: string | null; style?: unknown };

type PlacedForCompose = { imgUrl: string; x: number; y: number; scale: number; rotation: number; z: number };

function autoPlaceForCompose(items: ComposeItem[]): PlacedForCompose[] {
  const placed: PlacedForCompose[] = [];
  const seenInBucket: Partial<Record<Bucket, number>> = {};
  items.forEach((it) => {
    const b = bucketOf(it.category, it.style);
    const duplicateIndex = seenInBucket[b] ?? 0;
    seenInBucket[b] = duplicateIndex + 1;
    const fanOut = duplicateIndex * (b === "acc" ? 0.09 : 0.05) * (duplicateIndex % 2 === 0 ? 1 : -1);
    const rotationFan = duplicateIndex * 4 * (duplicateIndex % 2 === 0 ? 1 : -1);
    placed.push({
      imgUrl: it.imgUrl,
      x: LAYOUT_X[b] + fanOut,
      y: LAYOUT_Y[b] + duplicateIndex * 0.03,
      scale: b === "shoes" ? 0.28 : b === "acc" ? 0.24 : 0.42,
      rotation: LAYOUT_ROTATION[b] + rotationFan,
      z: Z_BY_BUCKET[b] ?? 1,
    });
  });
  return placed;
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

/** Fetches a (possibly cross-origin, signed) image URL and returns it as
 *  a data URL — the same technique OutfitBuilder.tsx's own export
 *  already relies on, and for the same reason: drawing a
 *  cross-origin image straight onto a canvas via `img.crossOrigin =
 *  "anonymous"` depends on the image server sending the right CORS
 *  headers, and Supabase Storage's SIGNED urls don't reliably do that —
 *  the canvas silently becomes "tainted" and toBlob()/toDataURL() can
 *  fail or throw instead of erroring cleanly at load time. Fetching the
 *  bytes ourselves and handing the canvas a data: URL sidesteps the
 *  cross-origin question entirely, since a data URL has no origin to
 *  conflict with. */
async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!resp.ok) throw new Error(`image fetch failed: ${resp.status}`);
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const CANVAS_SIZE = 1080;

/** Composes a set of already-signed item image URLs into one square
 *  outfit image, positioned the same way OutfitBuilder auto-places a
 *  fresh AI suggestion. Returns null (never throws) if any image fails
 *  to load — a broken/expired signed URL is common enough (see the
 *  export-time re-signing OutfitBuilder already does for the same
 *  reason) that the caller should just skip composing this time rather
 *  than crash the whole suggestion flow over a decorative image. */
export async function composeOutfitImage(items: ComposeItem[]): Promise<Blob | null> {
  if (!items.length) return null;
  const placedItems = autoPlaceForCompose(items);

  let images: HTMLImageElement[];
  try {
    const dataUrls = await Promise.all(placedItems.map((p) => toDataUrl(p.imgUrl)));
    images = await Promise.all(dataUrls.map((d) => loadImageEl(d)));
  } catch (e) {
    console.error("[AURA compose-outfit-canvas] one or more images failed to load", e);
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const drawOrder = placedItems
    .map((p, i) => ({ p, img: images[i] }))
    .sort((a, b) => a.p.z - b.p.z);

  for (const { p, img } of drawOrder) {
    const w = CANVAS_SIZE * p.scale;
    const h = w * (img.naturalHeight / img.naturalWidth || 1);
    const cx = CANVAS_SIZE * p.x;
    const cy = CANVAS_SIZE * p.y;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Same small "aura" watermark OutfitBuilder's canvas carries, so a
  // composed Home suggestion reads as the same kind of image if saved
  // or shared later, not a visually different, unbranded one.
  ctx.save();
  ctx.font = "italic 32px Georgia, serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.textAlign = "right";
  ctx.fillText("aura", CANVAS_SIZE - 24, CANVAS_SIZE - 20);
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** Composes and uploads in one step, returning the storage path (not a
 *  signed URL — callers sign it themselves at display time, same
 *  convention as every other image path stored in this app). Returns
 *  null on any failure, logged but not thrown — a missing composed
 *  image just means the caller falls back to its own plain grid, never
 *  a broken screen. */
export async function composeAndUploadOutfitImage(userId: string, items: ComposeItem[]): Promise<string | null> {
  const blob = await composeOutfitImage(items);
  if (!blob) return null;
  const path = `${userId}/home-suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage.from("outfits").upload(path, blob, {
    contentType: "image/png",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    console.error("[AURA compose-outfit-canvas] upload failed", error);
    return null;
  }
  return path;
}
