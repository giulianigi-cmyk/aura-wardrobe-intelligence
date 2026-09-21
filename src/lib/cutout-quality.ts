/** Automated quality check for a background-removal result — decides
 *  when the free, client-side cutout (bg-removal-client.ts) is good
 *  enough to keep, versus when it should be retried with remove.bg
 *  (a paid API call, so this check exists specifically to avoid paying
 *  for every single image when the free result is already fine).
 *
 *  Works by loading the resulting transparent PNG onto a small analysis
 *  canvas and looking at its alpha channel for three specific failure
 *  patterns, each corresponding to something reported directly:
 *  - "holes": a patch of transparency stranded INSIDE the garment,
 *    surrounded by opaque pixels — the "erases part of the item" case.
 *    Found via a flood fill from the image edges: any transparent pixel
 *    the fill never reaches isn't connected to the real background, so
 *    it's an island carved out of the subject rather than actual
 *    background around it.
 *  - "too-transparent": too much of the subject's own area came out
 *    partially see-through instead of solid — the "becomes a bit
 *    transparent" case.
 *  - "too-small": the surviving opaque area is implausibly small for a
 *    garment photo, suggesting most of the item itself got erased
 *    along with the background.
 *
 *  These thresholds are reasonable starting points, not values tuned
 *  against a labeled dataset of real results — if the fallback fires
 *  far more or less often than expected once this is live, adjust
 *  them rather than treating them as fixed.
 */

export type CutoutQualityResult = { ok: true } | { ok: false; reason: "holes" | "too-transparent" | "too-small" };

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
}

const ANALYSIS_SIZE = 220; // small on purpose — this only needs statistical signal, not precision
const ALPHA_TRANSPARENT = 20; // below this: treated as real background/emptiness
const ALPHA_OPAQUE = 235; // above this: treated as solid subject
const HOLE_RATIO_THRESHOLD = 0.01; // >1% of the frame stranded inside the subject
const SEMI_TRANSPARENT_RATIO_THRESHOLD = 0.15; // >15% of the frame is a hazy in-between fringe
const MIN_SUBJECT_RATIO = 0.05; // subject occupying under 5% of the frame reads as "mostly erased"

export async function analyzeCutoutQuality(imageDataUrl: string): Promise<CutoutQualityResult> {
  try {
    const img = await loadImageEl(imageDataUrl);
    const scale = ANALYSIS_SIZE / Math.max(img.naturalWidth, img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: true }; // can't analyze — don't block on it, just accept the result

    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3];

    // Flood fill from every edge pixel through transparent-or-background
    // pixels — anything transparent left unvisited afterward is a hole
    // stranded inside the subject, not real surrounding background.
    const visited = new Uint8Array(w * h);
    const queue: number[] = [];
    for (let x = 0; x < w; x++) { queue.push(x, w * (h - 1) + x); }
    for (let y = 0; y < h; y++) { queue.push(y * w, y * w + (w - 1)); }
    let qi = 0;
    while (qi < queue.length) {
      const p = queue[qi++];
      if (p < 0 || p >= w * h || visited[p]) continue;
      const x = p % w;
      const y = Math.floor(p / w);
      if (alphaAt(x, y) >= ALPHA_TRANSPARENT) continue; // only flood through background-level pixels
      visited[p] = 1;
      if (x > 0) queue.push(p - 1);
      if (x < w - 1) queue.push(p + 1);
      if (y > 0) queue.push(p - w);
      if (y < h - 1) queue.push(p + w);
    }

    let holePixels = 0;
    let opaquePixels = 0;
    let semiTransparentPixels = 0;
    const total = w * h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const a = alphaAt(x, y);
        if (a < ALPHA_TRANSPARENT) {
          if (!visited[p]) holePixels++;
        } else if (a >= ALPHA_OPAQUE) {
          opaquePixels++;
        } else {
          semiTransparentPixels++;
        }
      }
    }

    if (holePixels / total > HOLE_RATIO_THRESHOLD) return { ok: false, reason: "holes" };
    if (opaquePixels / total < MIN_SUBJECT_RATIO) return { ok: false, reason: "too-small" };
    if (semiTransparentPixels / total > SEMI_TRANSPARENT_RATIO_THRESHOLD) return { ok: false, reason: "too-transparent" };
    return { ok: true };
  } catch (e) {
    console.error("[AURA cutout-quality] analysis failed, accepting result as-is", e);
    return { ok: true }; // never block a save over the quality check itself failing
  }
}
