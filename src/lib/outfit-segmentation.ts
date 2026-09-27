/** Client-side clothing segmentation using segformer_b2_clothes.
 *  Runs entirely in the browser via @huggingface/transformers (WASM/WebGPU),
 *  no server round-trip and no per-image cost. */

type Segmenter = (input: string) => Promise<Array<{ label: string; mask: { data: Uint8Array | Uint8ClampedArray; width: number; height: number } }>>;

let segmenterPromise: Promise<Segmenter> | null = null;

async function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      // "q8" (8-bit quantized weights): a fraction of the default fp32 model's memory footprint,
      // which matters a lot more here than usual — this runs entirely in the phone's own browser,
      // and the unquantized model was heavy enough (combined with an unresized full-camera-resolution
      // photo, see shrinkForModel below) to get the mobile WebView killed outright rather than
      // produce a JS error. Segmentation mask quality is essentially unaffected by quantization.
      const seg = await pipeline("image-segmentation", "Xenova/segformer_b2_clothes", { dtype: "q8" });
      return seg as unknown as Segmenter;
    })().catch((e) => {
      segmenterPromise = null;
      throw e;
    });
  }
  return segmenterPromise;
}

const GARMENT_LABELS = new Set([
  "Hat", "Sunglasses", "Upper-clothes", "Skirt", "Pants", "Dress",
  "Belt", "Left-shoe", "Right-shoe", "Bag", "Scarf",
]);

// Body-coverage garments naturally fill a large share of a full-body photo; small worn or carried
// accessories never do, even when the model has correctly picked them out. A single "must cover
// at least 1.5% of the frame" cutoff was silently discarding real, correctly-segmented shoes, bags,
// sunglasses, belts and hats every time — they're always small in a full-length photo, so they
// never had a chance to clear the same bar as a shirt or a pair of trousers. Each label gets its
// own realistic floor instead. Uncovered by any label here at all — a watch, a bracelet, a
// necklace, earrings — this segmentation model's fixed category set has no such class, and no
// version of this threshold can produce one; that limitation lives one level up, not here.
const SMALL_ACCESSORY_LABELS = new Set(["Sunglasses", "Belt", "Left-shoe", "Right-shoe", "Bag", "Hat", "Scarf"]);
function minPixelsFor(label: string, totalPixels: number): number {
  return Math.floor(totalPixels * (SMALL_ACCESSORY_LABELS.has(label) ? 0.0015 : 0.015));
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image failed to load"));
    el.src = dataUrl;
  });
}

function maskNonZero(mask: Uint8Array | Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) n++;
  return n;
}

function unionMasks(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] > 127 || b[i] > 127) ? 255 : 0;
  return out;
}

function tightBoundingBox(mask: Uint8Array | Uint8ClampedArray, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 127) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

export type SegmentationMasks = {
  maskWidth: number;
  maskHeight: number;
  masksByLabel: Map<string, Uint8Array | Uint8ClampedArray>;
};

/** Downscales a data URL to at most `maxSide` on its longest edge before handing it to the
 *  segmentation model. A full-resolution phone photo (often 3000-4000px, several MB as a data URL)
 *  being decoded and preprocessed by a WASM model IN THE BROWSER is exactly the kind of memory
 *  spike that gets a mobile WebView killed outright — the person sees this as "the app crashes and
 *  closes" rather than an error message, since nothing in JS ever gets the chance to catch it. The
 *  model's own output resolution doesn't depend on the input size (segformer produces a fixed-size
 *  mask regardless), so this loses no real segmentation quality — only wasted decode/preprocess
 *  memory. The ORIGINAL image is untouched and still used for the final high-resolution crop
 *  (cropItemFromSegmentation scales the mask up to match it), only the copy fed to the model here
 *  is smaller. */
async function shrinkForModel(imageDataUrl: string, maxSide = 1024): Promise<string> {
  try {
    const img = await loadImage(imageDataUrl);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1) return imageDataUrl; // already small enough
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return imageDataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return imageDataUrl; // if anything goes wrong, fall back to the original rather than block
  }
}

/** Shared pipeline: run the model once and build the per-label mask map
 *  (with Left-shoe/Right-shoe merged into a single "Shoes" mask). */
async function runSegmentation(imageDataUrl: string): Promise<SegmentationMasks | null> {
  const segmenter = await getSegmenter();
  const modelInput = await shrinkForModel(imageDataUrl);
  const output = await segmenter(modelInput);

  const byLabel = new Map<string, Uint8Array | Uint8ClampedArray>();
  let maskW = 0, maskH = 0;
  for (const seg of output) {
    if (!seg?.mask) continue;
    maskW = seg.mask.width; maskH = seg.mask.height;
    if (GARMENT_LABELS.has(seg.label)) byLabel.set(seg.label, seg.mask.data);
  }
  if (!maskW || !maskH) return null;

  const ls = byLabel.get("Left-shoe");
  const rs = byLabel.get("Right-shoe");
  if (ls && rs) {
    byLabel.delete("Left-shoe"); byLabel.delete("Right-shoe");
    byLabel.set("Shoes", unionMasks(ls, rs));
  } else if (ls) {
    byLabel.delete("Left-shoe"); byLabel.set("Shoes", ls);
  } else if (rs) {
    byLabel.delete("Right-shoe"); byLabel.set("Shoes", rs);
  }

  return { maskWidth: maskW, maskHeight: maskH, masksByLabel: byLabel };
}

/** Public accessor for raw per-label masks. Uses the same singleton model. */
export async function getSegmentationMasks(imageDataUrl: string): Promise<SegmentationMasks | null> {
  return runSegmentation(imageDataUrl);
}

export async function segmentOutfitPhoto(imageDataUrl: string): Promise<{ label: string; imageDataUrl: string; fullPhotoMaskDataUrl: string }[]> {
  try {
    const seg = await runSegmentation(imageDataUrl);
    if (!seg) return [];
    const { maskWidth: maskW, maskHeight: maskH, masksByLabel: byLabel } = seg;

    const totalPixels = maskW * maskH;

    // Used only to map pixels between mask space and the original photo's own coordinates — see
    // scaleX/scaleY below. Color sampling for the final crop comes straight from the original
    // full-resolution photo, not from a downsized intermediate copy; see cropItemFromSegmentation
    // further down this file, which already did it this way.
    const img = await loadImage(imageDataUrl);

    const results: { label: string; imageDataUrl: string; fullPhotoMaskDataUrl: string }[] = [];

    // The segmentation model resizes its input to a fixed working shape without preserving the
    // photo's aspect ratio, so mask space and the original photo's space are related by a
    // DIFFERENT scale per axis whenever the photo isn't already that same shape (i.e. virtually
    // always, for a portrait phone photo). Cropping directly out of mask space, as this used to
    // do, therefore squashed or stretched every garment by however much the two axes disagreed —
    // sometimes badly enough that a t-shirt or a pair of jeans came out looking like a different,
    // unrecognizable shape entirely. Mapping the bounding box back to the photo's own coordinates
    // and drawing straight from the original (rather than from a small, already-distorted copy)
    // fixes both the shape and, as a bonus, the resolution of every crop.
    const scaleX = img.naturalWidth / maskW;
    const scaleY = img.naturalHeight / maskH;

    for (const [label, mask] of byLabel) {
      if (maskNonZero(mask) < minPixelsFor(label, totalPixels)) continue;
      const bbox = tightBoundingBox(mask, maskW, maskH);
      if (!bbox) continue;

      const bw = bbox.x1 - bbox.x0;
      const bh = bbox.y1 - bbox.y0;
      const padX = Math.round(bw * 0.04);
      const padY = Math.round(bh * 0.04);
      const x0 = Math.max(0, bbox.x0 - padX);
      const y0 = Math.max(0, bbox.y0 - padY);
      const x1 = Math.min(maskW, bbox.x1 + padX);
      const y1 = Math.min(maskH, bbox.y1 + padY);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;

      // Same padded box, in the original photo's own pixel coordinates.
      const ox0 = Math.max(0, Math.floor(x0 * scaleX));
      const oy0 = Math.max(0, Math.floor(y0 * scaleY));
      const ox1 = Math.min(img.naturalWidth, Math.ceil(x1 * scaleX));
      const oy1 = Math.min(img.naturalHeight, Math.ceil(y1 * scaleY));
      const cw = ox1 - ox0, ch = oy1 - oy0;
      if (cw < 2 || ch < 2) continue;

      const outCanvas = document.createElement("canvas");
      outCanvas.width = cw; outCanvas.height = ch;
      const outCtx = outCanvas.getContext("2d");
      if (!outCtx) continue;
      // Full-resolution color, cropped straight from the original photo — correct proportions,
      // full sharpness, no intermediate resize.
      outCtx.drawImage(img, ox0, oy0, cw, ch, 0, 0, cw, ch);
      const outImg = outCtx.getImageData(0, 0, cw, ch);
      const od = outImg.data;

      // Alpha comes from the mask, looked up per output pixel by mapping back into mask space
      // (nearest neighbour — the mask is binary, so there is no meaningful interpolation to do).
      for (let y = 0; y < ch; y++) {
        const my = Math.min(maskH - 1, Math.floor((oy0 + y) / scaleY));
        for (let x = 0; x < cw; x++) {
          const mx = Math.min(maskW - 1, Math.floor((ox0 + x) / scaleX));
          const m = mask[my * maskW + mx];
          od[(y * cw + x) * 4 + 3] = m > 127 ? 255 : 0;
        }
      }
      outCtx.putImageData(outImg, 0, 0);

      // A second mask, this one covering the FULL original photo (not
      // just the tight crop above) at the photo's own real resolution —
      // white where this garment is, black everywhere else. This is
      // what FASHN's Edit endpoint needs: its mask parameter must align
      // pixel-for-pixel with the full image it's asked to edit, since
      // the point is telling it "reconstruct THIS region using the rest
      // of the photo as context", not handing it an already-cropped
      // fragment with no surrounding scene to reason about.
      const fullMaskCanvas = document.createElement("canvas");
      fullMaskCanvas.width = maskW;
      fullMaskCanvas.height = maskH;
      const fullMaskCtx = fullMaskCanvas.getContext("2d");
      let fullPhotoMaskDataUrl = "";
      if (fullMaskCtx) {
        const maskImg = fullMaskCtx.createImageData(maskW, maskH);
        const md = maskImg.data;
        for (let i = 0; i < mask.length; i++) {
          const v = mask[i] > 127 ? 255 : 0;
          md[i * 4] = v; md[i * 4 + 1] = v; md[i * 4 + 2] = v; md[i * 4 + 3] = 255;
        }
        fullMaskCtx.putImageData(maskImg, 0, 0);
        // Scaled up to the ORIGINAL photo's real pixel dimensions so it
        // aligns exactly with the full-resolution image FASHN receives,
        // not the segmentation model's own smaller working resolution.
        if (img.naturalWidth !== maskW || img.naturalHeight !== maskH) {
          const scaledCanvas = document.createElement("canvas");
          scaledCanvas.width = img.naturalWidth;
          scaledCanvas.height = img.naturalHeight;
          const scaledCtx = scaledCanvas.getContext("2d");
          if (scaledCtx) {
            scaledCtx.imageSmoothingEnabled = false; // keep the mask edge crisp, no soft blending in
            scaledCtx.drawImage(fullMaskCanvas, 0, 0, img.naturalWidth, img.naturalHeight);
            fullPhotoMaskDataUrl = scaledCanvas.toDataURL("image/png");
          }
        } else {
          fullPhotoMaskDataUrl = fullMaskCanvas.toDataURL("image/png");
        }
      }

      results.push({ label, imageDataUrl: outCanvas.toDataURL("image/png"), fullPhotoMaskDataUrl });
    }

    return results;
  } catch (e) {
    console.error("[AURA outfit-segmentation] failed", e);
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Per-item segmentation crop (batch scan review)
 * ------------------------------------------------------------------ */

export type NormalizedBBox = { x: number; y: number; width: number; height: number };

/** AURA wardrobe category → candidate segformer labels, in priority order. */
const CATEGORY_LABELS: Record<string, string[]> = {
  Tops: ["Upper-clothes"],
  Outerwear: ["Upper-clothes"],
  Bottoms: ["Pants", "Skirt"],
  Dresses: ["Dress"],
  Shoes: ["Shoes"],
  Bags: ["Bag"],
  Accessories: ["Belt", "Scarf", "Hat", "Sunglasses"],
  Underwear: ["Upper-clothes", "Pants"],
};

// One in-flight promise per unique photo — guarantees exactly one
// segmentation run per photo even under concurrent item processing.
const photoMaskCache = new Map<string, Promise<SegmentationMasks | null>>();

export function getSegmentationMasksCached(photoKey: string, imageDataUrl: string): Promise<SegmentationMasks | null> {
  let p = photoMaskCache.get(photoKey);
  if (!p) {
    p = runSegmentation(imageDataUrl).catch((e) => {
      console.error("[AURA outfit-segmentation] mask run failed", e);
      return null;
    });
    photoMaskCache.set(photoKey, p);
  }
  return p;
}

export function clearSegmentationCache() {
  photoMaskCache.clear();
}

function erodeDilate(mask: Uint8Array, w: number, h: number, dilate: boolean): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let hit = dilate ? false : true;
      for (let dy = -1; dy <= 1 && (dilate ? !hit : hit); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : mask[ny * w + nx];
          if (dilate) { if (v > 127) { hit = true; break; } }
          else if (v <= 127) { hit = false; break; }
        }
      }
      out[i] = hit ? 255 : 0;
    }
  }
  return out;
}

type Component = { pixels: number[]; minX: number; minY: number; maxX: number; maxY: number };

function connectedComponents(mask: Uint8Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(mask.length);
  const comps: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] <= 127 || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const comp: Component = { pixels: [], minX: w, minY: h, maxX: -1, maxY: -1 };
    while (stack.length) {
      const idx = stack.pop() as number;
      const x = idx % w, y = (idx / w) | 0;
      comp.pixels.push(idx);
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      const neigh = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const n of neigh) {
        if (n >= 0 && !seen[n] && mask[n] > 127) { seen[n] = 1; stack.push(n); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/**
 * Build a per-pixel cutout for ONE detected item by intersecting the semantic
 * mask for its category with the item's AI bounding box, cleaning the mask,
 * and keeping only the connected component that belongs to this item.
 * Compositing/cropping happens at the ORIGINAL photo resolution.
 * Returns null when there is no confident match (caller should fall back).
 */
export async function cropItemFromSegmentation(
  photoKey: string,
  photoDataUrl: string,
  category: string,
  bbox: NormalizedBBox | null,
): Promise<string | null> {
  try {
    if (!bbox) return null;
    const seg = await getSegmentationMasksCached(photoKey, photoDataUrl);
    if (!seg) return null;
    const { maskWidth: mw, maskHeight: mh, masksByLabel } = seg;

    const candidates = CATEGORY_LABELS[category] ?? [];
    if (!candidates.length) return null;

    const total = mw * mh;
    const minRegionPixels = Math.max(24, Math.floor(total * 0.002));

    // bbox in mask pixel space (original + padded).
    // Padding widened from 12% to 28%: Gemini's bbox is a rough estimate,
    // not a precise garment outline — a sleeve or hem that extends past a
    // slightly-undersized box was being hard-cut here even when the
    // segmentation model had correctly identified the whole garment.
    const bx0 = Math.max(0, Math.round(bbox.x * mw));
    const by0 = Math.max(0, Math.round(bbox.y * mh));
    const bx1 = Math.min(mw, Math.round((bbox.x + bbox.width) * mw));
    const by1 = Math.min(mh, Math.round((bbox.y + bbox.height) * mh));
    const padX = Math.round((bx1 - bx0) * 0.28);
    const padY = Math.round((by1 - by0) * 0.28);
    const px0 = Math.max(0, bx0 - padX);
    const py0 = Math.max(0, by0 - padY);
    const px1 = Math.min(mw, bx1 + padX);
    const py1 = Math.min(mh, by1 + padY);
    if (px1 - px0 < 2 || py1 - py0 < 2) return null;

    let chosen: Uint8Array | null = null;
    for (const label of candidates) {
      const src = masksByLabel.get(label);
      if (!src || maskNonZero(src) < minPixelsFor(label, total)) continue;

      // Intersect with the padded bbox.
      let work: Uint8Array<ArrayBufferLike> = new Uint8Array(total);
      let kept = 0;
      for (let y = py0; y < py1; y++) {
        for (let x = px0; x < px1; x++) {
          const i = y * mw + x;
          if (src[i] > 127) { work[i] = 255; kept++; }
        }
      }
      if (kept < minRegionPixels) continue;

      // Conservative cleanup: 1px opening then closing.
      work = erodeDilate(work, mw, mh, false);
      work = erodeDilate(work, mw, mh, true);
      work = erodeDilate(work, mw, mh, true);
      work = erodeDilate(work, mw, mh, false);

      // Keep the component that best overlaps the ORIGINAL bbox.
      const comps = connectedComponents(work, mw, mh).filter((c) => c.pixels.length >= minRegionPixels);
      if (!comps.length) continue;

      // Keep every component that substantially overlaps the ORIGINAL bbox
      // (not just the single best one) — a garment split across the photo
      // by occlusion (crossed arms, a bag strap, another layer) is still
      // one physical item, and dropping the smaller pieces is exactly what
      // produced crops with a missing sleeve or hem.
      let best: Component | null = null;
      let bestScore = -1;
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      const merged: Component[] = [];
      for (const c of comps) {
        let overlap = 0;
        let sx = 0, sy = 0;
        for (const idx of c.pixels) {
          const x = idx % mw, y = (idx / mw) | 0;
          sx += x; sy += y;
          if (x >= bx0 && x < bx1 && y >= by0 && y < by1) overlap++;
        }
        const overlapFrac = overlap / c.pixels.length;
        const ccx = sx / c.pixels.length, ccy = sy / c.pixels.length;
        const dist = Math.hypot(ccx - cx, ccy - cy) || 1;
        const score = overlap > 0 ? overlap : 1 / dist;
        if (score > bestScore) { bestScore = score; best = c; }
        // 20%+ of this piece sits inside the AI's box → almost certainly
        // the same garment, just visually disconnected in this photo.
        if (overlapFrac >= 0.2) merged.push(c);
      }
      if (!best) continue;
      if (!merged.includes(best)) merged.push(best);

      const final = new Uint8Array(total);
      for (const c of merged) for (const idx of c.pixels) final[idx] = 255;
      const mergedPixelCount = merged.reduce((n, c) => n + c.pixels.length, 0);
      if (mergedPixelCount < minRegionPixels) continue;
      chosen = final;
      break;
    }

    if (!chosen) return null;

    // Composite at ORIGINAL resolution.
    const img = await loadImage(photoDataUrl);
    const ow = img.naturalWidth, oh = img.naturalHeight;
    if (!ow || !oh) return null;

    const box = tightBoundingBox(chosen, mw, mh);
    if (!box) return null;
    const sxScale = ow / mw, syScale = oh / mh;
    const cx0 = Math.max(0, Math.floor(box.x0 * sxScale));
    const cy0 = Math.max(0, Math.floor(box.y0 * syScale));
    const cx1 = Math.min(ow, Math.ceil(box.x1 * sxScale));
    const cy1 = Math.min(oh, Math.ceil(box.y1 * syScale));
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (cw < 4 || ch < 4) return null;

    // Draw the source at full resolution, cropped.
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, cx0, cy0, cw, ch, 0, 0, cw, ch);
    const imgData = ctx.getImageData(0, 0, cw, ch);
    const d = imgData.data;

    // Upscale mask (nearest neighbour) onto the full-res crop as alpha.
    for (let y = 0; y < ch; y++) {
      const my = Math.min(mh - 1, Math.floor((cy0 + y) / syScale));
      for (let x = 0; x < cw; x++) {
        const mx = Math.min(mw - 1, Math.floor((cx0 + x) / sxScale));
        const on = chosen[my * mw + mx] > 127;
        if (!on) d[(y * cw + x) * 4 + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    if (import.meta.env.DEV) {
      console.debug("[AURA segmentation-crop]", { category, mask: [mw, mh], source: [ow, oh], crop: [cw, ch] });
    }

    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("[AURA outfit-segmentation] item crop failed", e);
    return null;
  }
}
