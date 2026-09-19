/** Shared outfit-canvas composition for Home ("Today's edit" + curated
 *  looks). The layout maths live in outfit-layout.ts (pure, testable, and
 *  meant to be reused by OutfitBuilder.tsx so the two never diverge).
 *
 *  What changed vs. the previous version:
 *   - images are loaded FIRST, so placement uses each garment's real
 *     aspect ratio (before, `scale` was used as both width and height,
 *     which is why trouser height came out random and tops got cropped);
 *   - transparent padding around each cut-out is trimmed before measuring,
 *     so the layout is based on the visible garment, not the file;
 *   - canvas is 4:5 (1080x1350) like the editorial references, with a warm
 *     neutral background instead of pure white.
 *
 *  Plain Canvas 2D API (no DOM clone), so it can compose headlessly.
 */
import { supabase } from "@/integrations/supabase/client";
import { bucketOf, layoutOutfit, CANVAS_W, CANVAS_H, type Bucket, type LayoutRect } from "@/lib/outfit-layout";

export { bucketOf };
export type { Bucket };

export type ComposeItem = { id: string; imgUrl: string; category: string | null; subcategory?: string | null };

const BACKGROUND = "#FFFFFF";

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

/** Fetches a (possibly cross-origin, signed) image URL and returns it as a
 *  data URL — sidesteps canvas tainting with Supabase signed URLs (same
 *  technique OutfitBuilder's export uses). */
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

type Crop = { sx: number; sy: number; sw: number; sh: number };

/** Bounding box of the non-transparent pixels (alpha > 16), scanned on a
 *  downscaled copy for speed. Fully opaque images (JPEG, white bg) return
 *  the whole image. Never throws. */
function visibleCrop(img: HTMLImageElement): Crop {
  const full: Crop = { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  try {
    const maxSide = 320;
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx) return full;
    cx.drawImage(img, 0, 0, w, h);
    const { data } = cx.getImageData(0, 0, w, h);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return full;
    // ignore a crop that removes almost nothing or almost everything
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < w * 0.05 || bh < h * 0.05) return full;
    return {
      sx: Math.floor(minX / k), sy: Math.floor(minY / k),
      sw: Math.min(img.naturalWidth, Math.ceil(bw / k)), sh: Math.min(img.naturalHeight, Math.ceil(bh / k)),
    };
  } catch {
    return full;
  }
}

type Prepared = { r: LayoutRect; img: HTMLImageElement; crop: Crop }[];

/** Loads every image, trims its transparent padding and runs the layout.
 *  Deterministic: the same items always give the same rectangles, which is
 *  what lets the canvas editor re-derive the exact arrangement of a look
 *  that Home composed (see computeBuilderLayout). Returns null on any load
 *  failure (logged, never thrown). */
async function prepareLayout(items: ComposeItem[]): Promise<Prepared | null> {
  let images: HTMLImageElement[];
  try {
    const dataUrls = await Promise.all(items.map((p) => toDataUrl(p.imgUrl)));
    images = await Promise.all(dataUrls.map((d) => loadImageEl(d)));
  } catch (e) {
    console.error("[AURA compose-outfit-canvas] one or more images failed to load", e);
    return null;
  }

  const crops = images.map(visibleCrop);
  const rects = layoutOutfit(
    items.map((it, i) => ({
      id: it.id,
      bucket: bucketOf(it.category, it.subcategory),
      aspect: crops[i].sh / crops[i].sw || 1,
    })),
    CANVAS_W, CANVAS_H,
  );
  // layoutOutfit returns rects by id; map back to the loaded image + crop.
  // (ids are unique per outfit; if an id repeats, fall back to order.)
  const used = new Set<number>();
  return rects.map((r) => {
    let idx = items.findIndex((it, i) => it.id === r.id && !used.has(i));
    if (idx < 0) idx = 0;
    used.add(idx);
    return { r, img: images[idx], crop: crops[idx] };
  });
}

/** One entry of an OutfitBuilder layout (same shape as outfits.layout). */
export type BuilderLayoutEntry = { itemId: string; x: number; y: number; scale: number; rotation: number; z: number };

/** The EXACT arrangement Home composes, expressed in OutfitBuilder's
 *  coordinates, so opening a look on the canvas never moves a garment.
 *
 *  Home's canvas is 4:5, the builder's default is 1:1: the whole
 *  composition is scaled by 0.8 and centred inside the square (same
 *  relative positions and sizes, just with side margins). The builder
 *  draws each image UNtrimmed while Home draws the trimmed visible area,
 *  so every rectangle is expanded back to the full image to keep the
 *  visible pixels in the same place. */
export async function computeBuilderLayout(items: ComposeItem[]): Promise<BuilderLayoutEntry[] | null> {
  if (!items.length) return null;
  const prepared = await prepareLayout(items);
  if (!prepared) return null;
  const k = CANVAS_H > 0 ? CANVAS_W / CANVAS_H : 1; // 4:5 → 0.8
  const offX = (CANVAS_W - CANVAS_W * k) / 2;
  return prepared.map(({ r, img, crop }) => {
    const fullW = (r.w * img.naturalWidth) / crop.sw;
    const fullH = (r.h * img.naturalHeight) / crop.sh;
    const fullLeft = r.x - (r.w * crop.sx) / crop.sw;
    const fullTop = r.y - (r.h * crop.sy) / crop.sh;
    const cx = fullLeft + fullW / 2;
    const cy = fullTop + fullH / 2;
    return {
      itemId: r.id,
      x: (offX + k * cx) / CANVAS_W,
      y: (k * cy) / CANVAS_W, // builder 1:1 canvas: height == width
      scale: (k * fullW) / CANVAS_W,
      rotation: 0,
      z: r.z,
    };
  });
}

/** Composes already-signed item image URLs into one 4:5 outfit image.
 *  Returns null (never throws) if any image fails to load, so callers can
 *  fall back to their plain grid instead of breaking the flow. */
export async function composeOutfitImage(items: ComposeItem[]): Promise<Blob | null> {
  if (!items.length) return null;

  const prepared = await prepareLayout(items);
  if (!prepared) return null;
  const drawList = [...prepared].sort((a, b) => a.r.z - b.r.z);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.imageSmoothingQuality = "high";

  for (const { r, img, crop } of drawList) {
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, r.x, r.y, r.w, r.h);
  }

  // Watermark: bottom-CENTER, not bottom-right. The Home cards clip the image
  // with rounded corners (up to ~108 canvas px of radius on the small "Curated"
  // cards), which cut a corner-anchored label. Centered, it can never be
  // clipped, and 60px keeps it readable when the canvas is scaled to ~160px wide.
  ctx.save();
  ctx.font = "italic 60px Georgia, serif";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("aura", CANVAS_W / 2, CANVAS_H - 14);
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** Composes and uploads in one step; returns the storage path (callers sign
 *  it at display time) or null on any failure (logged, never thrown). */
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
