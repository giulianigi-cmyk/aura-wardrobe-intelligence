/** Shared outfit-canvas composition — the SAME auto-placement logic
 *  OutfitBuilder.tsx uses (zone-per-bucket, no rotation, row spacing
 *  computed so same-bucket items overlap by at most 10% of their own
 *  width rather than a fixed guessed offset — see OutfitBuilder.tsx for
 *  the full reasoning), extracted here so Home.tsx's "Today's Edit" and
 *  curated looks can compose the SAME kind of real outfit image instead
 *  of showing a plain grid of separate item photos.
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

export type Bucket = "dress" | "bottom" | "top" | "outer" | "shoes" | "bag" | "sunglasses" | "jewelry" | "belt" | "acc";

// Mirrors OutfitBuilder.tsx's autoPlace exactly (same anchor-relative
// composition logic, same scale/z tables) so a composed Home suggestion
// and a manually-built outfit read as the same kind of editorial
// composition, not two different visual styles for what's conceptually
// the same feature. See OutfitBuilder.tsx for the full reasoning.
const BASE_SCALE: Record<Bucket, number> = {
  dress: 0.50, bottom: 0.42, top: 0.40, outer: 0.44,
  shoes: 0.22, bag: 0.24, sunglasses: 0.14, jewelry: 0.11, belt: 0.16, acc: 0.18,
};
const Z_BY_BUCKET: Record<Bucket, number> = {
  dress: 1, bottom: 1, top: 2, outer: 1,
  shoes: 3, bag: 4, sunglasses: 5, jewelry: 5, belt: 3, acc: 4,
};
const MAX_OVERLAP_FRACTION = 0.10;
// Extra safety this headless renderer can afford that the interactive
// canvas can't (that one only knows an image's real aspect ratio once
// it's already loaded in the DOM, at layout time this doesn't yet
// exist) — every image here IS already loaded by the time we place it,
// so an unusually tall garment photo can be capped by its OWN real
// aspect ratio, not just its nominal width-based scale, guaranteeing it
// never reads as taller than the canvas even in an extreme case.
const MAX_HEIGHT_FRACTION = 0.88;

export function bucketOf(category: string | null, subcategory?: string | null): Bucket {
  const sub = (subcategory ?? "").toLowerCase();
  if (category === "Dresses" || category === "Jumpsuits") return "dress";
  if (category === "Bottoms") return "bottom";
  if (category === "Tops") return "top";
  if (category === "Outerwear") return "outer";
  if (category === "Shoes") return "shoes";
  if (category === "Bags") return "bag";
  if (category === "Accessories") {
    if (sub === "sunglasses") return "sunglasses";
    if (sub === "belt") return "belt";
    if (["earrings", "necklace", "bracelet", "ring", "brooch", "anklet", "watch"].includes(sub)) return "jewelry";
  }
  return "acc";
}

export type ComposeItem = { id: string; imgUrl: string; category: string | null; subcategory?: string | null };

type PlacedForCompose = { imgUrl: string; x: number; y: number; scale: number; z: number };

function fanOutAround(n: number, scale: number, centerX: number, centerY: number, axis: "x" | "y" = "x"): { x: number; y: number }[] {
  if (n <= 1) return [{ x: centerX, y: centerY }];
  const step = scale * (1 - MAX_OVERLAP_FRACTION);
  const totalSpan = step * (n - 1);
  const start = -totalSpan / 2;
  return Array.from({ length: n }, (_, i) => {
    const offset = start + i * step;
    return axis === "x" ? { x: centerX + offset, y: centerY } : { x: centerX, y: centerY + offset };
  });
}

function autoPlaceForCompose(items: ComposeItem[]): PlacedForCompose[] {
  const withBucket = items.map((it) => ({ it, bucket: bucketOf(it.category, it.subcategory) }));
  const byBucket = new Map<Bucket, ComposeItem[]>();
  for (const { it, bucket } of withBucket) {
    const list = byBucket.get(bucket) ?? [];
    list.push(it);
    byBucket.set(bucket, list);
  }
  if (!withBucket.length) return [];

  const anchorBucket: Bucket = byBucket.has("dress") ? "dress" : byBucket.has("bottom") ? "bottom" : "top";
  const anchorScale = BASE_SCALE[anchorBucket];
  const anchorX = 0.46;
  const anchorY = anchorBucket === "top" ? 0.42 : 0.54;

  const placed: PlacedForCompose[] = [];
  const place = (it: ComposeItem, x: number, y: number, scale: number, z: number) => {
    placed.push({ imgUrl: it.imgUrl, x, y, scale, z });
  };

  const anchorEntries = byBucket.get(anchorBucket) ?? [];
  const anchorPositions = fanOutAround(anchorEntries.length, anchorScale, anchorX, anchorY, "x");
  anchorEntries.forEach((it, idx) => place(it, anchorPositions[idx].x, anchorPositions[idx].y, anchorScale, Z_BY_BUCKET[anchorBucket]));

  if (anchorBucket === "bottom" && byBucket.has("top")) {
    const topEntries = byBucket.get("top")!;
    const topScale = BASE_SCALE.top;
    const overlapGap = (anchorScale / 2 + topScale / 2) * (1 - MAX_OVERLAP_FRACTION * 1.2);
    const topY = anchorY - overlapGap;
    const positions = fanOutAround(topEntries.length, topScale, anchorX + 0.03, topY, "x");
    topEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, topScale, Z_BY_BUCKET.top));
  }

  if (byBucket.has("outer")) {
    const outerEntries = byBucket.get("outer")!;
    const outerScale = BASE_SCALE.outer;
    const topY = anchorBucket === "bottom" && byBucket.has("top") ? anchorY - (anchorScale / 2 + BASE_SCALE.top / 2) * 0.85 : anchorY - anchorScale * 0.15;
    const positions = fanOutAround(outerEntries.length, outerScale, anchorX + anchorScale * 0.55, topY, "y");
    outerEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, outerScale, Z_BY_BUCKET.outer));
  }

  if (byBucket.has("shoes")) {
    const shoeEntries = byBucket.get("shoes")!;
    const shoeScale = BASE_SCALE.shoes;
    const shoeY = anchorY + anchorScale / 2 + shoeScale * 0.55;
    const positions = fanOutAround(shoeEntries.length, shoeScale, anchorX, shoeY, "x");
    shoeEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, shoeScale, Z_BY_BUCKET.shoes));
  }

  if (byBucket.has("bag")) {
    const bagEntries = byBucket.get("bag")!;
    const bagScale = BASE_SCALE.bag;
    const bagX = anchorX - anchorScale / 2 - bagScale * 0.6;
    const bagY = anchorY + anchorScale * 0.12;
    const positions = fanOutAround(bagEntries.length, bagScale, bagX, bagY, "y");
    bagEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, bagScale, Z_BY_BUCKET.bag));
  }

  if (byBucket.has("belt")) {
    const beltEntries = byBucket.get("belt")!;
    const beltScale = BASE_SCALE.belt;
    const beltY = anchorBucket === "bottom" ? anchorY - anchorScale * 0.42 : anchorY;
    const positions = fanOutAround(beltEntries.length, beltScale, anchorX + anchorScale * 0.35, beltY, "y");
    beltEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, beltScale, Z_BY_BUCKET.belt));
  }

  if (byBucket.has("sunglasses")) {
    const glassesEntries = byBucket.get("sunglasses")!;
    const glassesScale = BASE_SCALE.sunglasses;
    const topEdgeY = anchorBucket === "bottom" && byBucket.has("top")
      ? anchorY - (anchorScale / 2 + BASE_SCALE.top / 2) * (1 - MAX_OVERLAP_FRACTION * 1.2) - BASE_SCALE.top / 2
      : anchorY - anchorScale / 2;
    const glassesY = Math.max(0.08, topEdgeY - glassesScale * 0.7);
    const positions = fanOutAround(glassesEntries.length, glassesScale, anchorX + anchorScale * 0.2, glassesY, "x");
    glassesEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, glassesScale, Z_BY_BUCKET.sunglasses));
  }

  if (byBucket.has("jewelry")) {
    const jewelryEntries = byBucket.get("jewelry")!;
    const jewelryScale = BASE_SCALE.jewelry;
    const neckY = anchorBucket === "bottom" && byBucket.has("top")
      ? anchorY - (anchorScale / 2 + BASE_SCALE.top / 2) * (1 - MAX_OVERLAP_FRACTION * 1.2)
      : anchorY - anchorScale * 0.3;
    const positions = fanOutAround(jewelryEntries.length, jewelryScale, anchorX - anchorScale * 0.25, neckY, "x");
    jewelryEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, jewelryScale, Z_BY_BUCKET.jewelry));
  }

  if (byBucket.has("acc")) {
    const accEntries = byBucket.get("acc")!;
    const accScale = BASE_SCALE.acc;
    const positions = fanOutAround(accEntries.length, accScale, anchorX + anchorScale * 0.5, anchorY + anchorScale * 0.35, "y");
    accEntries.forEach((it, idx) => place(it, positions[idx].x, positions[idx].y, accScale, Z_BY_BUCKET.acc));
  }

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
    let w = CANVAS_SIZE * p.scale;
    let h = w * (img.naturalHeight / img.naturalWidth || 1);
    // Real aspect-ratio cap: an unusually tall garment photo (a maxi
    // dress, a long coat) could otherwise exceed a sensible height even
    // at a normal width-based scale — shrink proportionally so height
    // never exceeds the cap, rather than letting it run past the
    // canvas the way the previous version could.
    const maxH = CANVAS_SIZE * MAX_HEIGHT_FRACTION;
    if (h > maxH) {
      const shrink = maxH / h;
      w *= shrink;
      h = maxH;
    }
    const cx = CANVAS_SIZE * p.x;
    const cy = CANVAS_SIZE * p.y;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
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
