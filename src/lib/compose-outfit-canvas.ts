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

export type ComposeItem = { id: string; imgUrl: string; category: string | null; subcategory?: string | null; length?: string | null };

const BACKGROUND = "#FFFFFF";
const SIGNATURE_FONT = 'italic 400 100px "Cormorant Garamond", "Times New Roman", serif';
const SIGNATURE_COLOR = "#6b6159"; // app text grey (muted-foreground)
/** Right margin of the signature, canvas px (≈ 6.7% of the width). */
export const SIGNATURE_RIGHT_MARGIN = 72;


function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

/** Longest side kept for composing: the canvas is 1080 px wide and no piece is ever drawn larger,
 *  so decoding a 4000-px (up to ~19 MB) original only cost memory — on an iPhone, enough of them
 *  at once made Safari reload the page. */
export const COMPOSE_MAX_DIMENSION = 1080;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Fetches a (possibly cross-origin, signed) image URL and returns it as a data URL, downscaled to
 *  COMPOSE_MAX_DIMENSION — sidesteps canvas tainting with Supabase signed URLs (same technique
 *  OutfitBuilder's export uses). Transparency is kept (PNG). */
async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!resp.ok) throw new Error(`image fetch failed: ${resp.status}`);
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return blobToDataUrl(blob);
  const scale = Math.min(1, COMPOSE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) { bitmap.close(); return blobToDataUrl(blob); }
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(bitmap.width * scale));
  off.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = off.getContext("2d");
  if (!ctx) { bitmap.close(); return blobToDataUrl(blob); }
  ctx.drawImage(bitmap, 0, 0, off.width, off.height);
  bitmap.close();
  const out = off.toDataURL("image/png");
  off.width = 0; // free the backing store now rather than at the next GC
  off.height = 0;
  return out;
}

/** Loaded-image cache, keyed by signed URL. The same pieces are loaded again and
 *  again (Home compose, the viewer, every manual "add piece" on the canvas), and
 *  each load is a network fetch + decode: caching makes re-layouts near-instant.
 *  Bounded, and a failed load is never cached. */
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadCachedImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = toDataUrl(url).then(loadImageEl);
    imageCache.set(url, p);
    p.catch(() => imageCache.delete(url));
    if (imageCache.size > 30) {
      const oldest = imageCache.keys().next().value;
      if (oldest !== undefined) imageCache.delete(oldest);
    }
  }
  return p;
}

type Crop = { sx: number; sy: number; sw: number; sh: number; /** opaque share of the box, 0-1 */ fill?: number };

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
    let minX = w, minY = h, maxX = -1, maxY = -1, opaque = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 16) {
          opaque++;
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
      fill: Math.min(1, opaque / (bw * bh)),
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
    images = await Promise.all(items.map((p) => loadCachedImage(p.imgUrl)));
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
      subcategory: it.subcategory ?? null,
      length: it.length ?? null,
      fill: crops[i].fill ?? null,
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
 *  coordinates, so opening a look on the canvas never moves a garment —
 *  and so pieces added by hand land at the same sizes and places the
 *  automatic composition uses.
 *
 *  Home's canvas is 4:5. The builder's is 1:1 (or 9:16): the whole
 *  composition is scaled to fit inside it and centred (same relative
 *  positions and sizes, just with margins). `canvasAspect` is the builder
 *  canvas's height / width (1 for 1:1, 16/9 for 9:16). The builder draws
 *  each image UNtrimmed while Home draws the trimmed visible area, so every
 *  rectangle is expanded back to the full image to keep the visible pixels
 *  in the same place. */
export async function computeBuilderLayout(items: ComposeItem[], canvasAspect = 1): Promise<BuilderLayoutEntry[] | null> {
  if (!items.length) return null;
  const prepared = await prepareLayout(items);
  if (!prepared) return null;
  const canvasH = canvasAspect * CANVAS_W; // builder canvas height, in width units
  const k = Math.min(1, canvasH / CANVAS_H); // fit the 4:5 composition inside it
  const offX = (CANVAS_W - k * CANVAS_W) / 2;
  const offY = (canvasH - k * CANVAS_H) / 2;
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
      y: (offY + k * cy) / canvasH,
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

  // Signature: the same "aura" wordmark as the Splash screen — Cormorant Garamond
  // italic, in the app's text grey, at its reference size (100px on a 1080px canvas).
  // Bottom-RIGHT, the same distance from the bottom as from the right edge (the
  // baseline used to sit 18px from the bottom, so the mark looked pushed against it);
  // the Home cards' rounded corners (up to ~108 canvas px of radius) don't reach it. The OutfitBuilder
  // canvas uses the same size and position (see its watermark), so every outfit
  // canvas — AI or manual, new or reopened — carries the same mark.
  // It sits inside the strip outfit-layout.ts keeps empty (BOTTOM_RESERVED).
  await drawSignature(ctx, CANVAS_W, CANVAS_H);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** The "aura" wordmark, bottom-right, at its reference size for a 1080-px-wide canvas. */
async function drawSignature(ctx: CanvasRenderingContext2D, width: number, height: number): Promise<void> {
  try {
    await document.fonts.load(SIGNATURE_FONT);
  } catch {
    /* font not available: falls back to the serif stack below */
  }
  ctx.save();
  ctx.font = SIGNATURE_FONT;
  ctx.fillStyle = SIGNATURE_COLOR;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  // tight tracking like the wordmark (tracking-tight); ignored where unsupported
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "-2px";
  ctx.fillText("aura", width - SIGNATURE_RIGHT_MARGIN, height - SIGNATURE_RIGHT_MARGIN);
  ctx.restore();
}

/** A piece as placed on the manual canvas editor (OutfitBuilder): centre and width as fractions of
 *  the canvas, rotation in degrees, stacking order. */
export type PlacedPiece = { imgUrl: string; x: number; y: number; scale: number; rotation: number; z: number };

/** Draws the manual canvas exactly as laid out on screen, piece by piece, straight onto a canvas.
 *  Replaces the DOM screenshot (html-to-image), which on iPhone Safari silently dropped pieces whose
 *  image wasn't painted yet — saved outfits came out with only the bag, or the jeans and the bag.
 *  Every image must load and decode, or nothing is returned: a partial canvas is never saved.
 *  Mirrors the editor's CSS: box width = scale × canvas width, height from the image's proportions,
 *  capped at 88% of the short side (object-fit: contain), centred on (x, y), rotated about its centre. */
export async function renderPlacedCanvas(pieces: PlacedPiece[], width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  const maxH = 0.88 * Math.min(width, height);

  for (const p of [...pieces].sort((a, b) => a.z - b.z)) {
    // One at a time (memory), each one checked: a "loaded" image with no size draws nothing.
    const img = await loadCachedImage(p.imgUrl);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("piece image is empty");
    const boxW = p.scale * width;
    const fullH = boxW * (img.naturalHeight / img.naturalWidth);
    const drawH = Math.min(fullH, maxH);
    const drawW = drawH < fullH ? drawH * (img.naturalWidth / img.naturalHeight) : boxW;
    ctx.save();
    ctx.translate(p.x * width, p.y * height);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  await drawSignature(ctx, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  canvas.width = 0; // release the backing store
  canvas.height = 0;
  return blob;
}

/** Composes and uploads in one step; returns the storage path (callers sign
 *  it at display time) or null on any failure (logged, never thrown). */
export async function composeAndUploadOutfitImage(userId: string, items: ComposeItem[]): Promise<string | null> {
  const blob = await composeOutfitImage(items);
  if (!blob) return null;
  const path = `${userId}/home-suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage.from("outfits").upload(path, blob, {
    contentType: "image/png",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    console.error("[AURA compose-outfit-canvas] upload failed", error);
    return null;
  }
  return path;
}
