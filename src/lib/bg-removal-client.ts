import { cleanCutout, colorKeyCutout, estimateBackground, keptForegroundRatio, MIN_KEPT_FOREGROUND } from "@/lib/cutout-cleanup";

/** Above this many pixels the clean-up is skipped (memory on phones): the raw cutout is used. */
const CLEANUP_MAX_PIXELS = 6_000_000;

async function pixelsOf(source: Blob, w?: number, h?: number) {
  const bmp = await createImageBitmap(source);
  try {
    const cw = w ?? bmp.width, ch = h ?? bmp.height;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, cw, ch);
    return { canvas, ctx, data: ctx.getImageData(0, 0, cw, ch) };
  } finally {
    bmp.close();
  }
}

/** The cutout with background residue removed (cutout-cleanup.ts); the raw cutout on any failure.
 *  On a plain background it is also checked against the original photo: when the model erased
 *  most of the garment (a dark sweater of which only the light motif survived), the cutout is
 *  rebuilt from the background colour instead. */
async function cleanCutoutBlob(cutout: Blob, originalDataUrl: string): Promise<Blob> {
  try {
    const cut = await pixelsOf(cutout);
    if (!cut) return cutout;
    const { width: w, height: h } = cut.data;
    if (w * h > CLEANUP_MAX_PIXELS) return cutout;
    const original = await pixelsOf(await (await fetch(originalDataUrl)).blob(), w, h);
    const bg = original ? estimateBackground(original.data.data, w, h) : null;
    const kept = original && bg ? keptForegroundRatio(original.data.data, cut.data.data, w, h, bg) : null;
    if (original && bg && kept != null && kept < MIN_KEPT_FOREGROUND) {
      console.warn("[AURA bg-removal] model erased part of the garment, using colour cutout", { kept: Math.round(kept * 100) });
      cut.data.data.set(colorKeyCutout(original.data.data, w, h, bg));
    } else if (cleanCutout(cut.data.data, w, h, bg) === 0) {
      return cutout;
    }
    cut.ctx.putImageData(cut.data, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => cut.canvas.toBlob(resolve, "image/png"));
    return out ?? cutout;
  } catch (e) {
    console.warn("[AURA bg-removal] cutout clean-up skipped", e instanceof Error ? e.message : String(e));
    return cutout;
  }
}

export async function removeBackgroundClient(
  imageDataUrl: string,
): Promise<{ ok: true; imageDataUrl: string } | { ok: false; error: string } > {
  try {
    // Explicit "large" (full-precision isnet, not the fp16/quantized
    // variants) — belt loops, bracelets, hoop earrings and similar
    // ring-shaped pieces have background visible THROUGH a hole in the
    // subject, which is a genuinely harder case for any segmentation
    // model than a normal silhouette cutout. This is the strongest lever
    // actually available for that: no config at all defaults to
    // "medium" (isnet_fp16), and "small" (isnet_quint8) — a smaller,
    // quantized model — would only make hole detection worse, not
    // better, despite once being the intended choice for performance
    // reasons. Trades processing time for accuracy; there's no
    // configuration that guarantees a clean hole every time, this only
    // improves the odds.
    // Loaded on first use: the library is only needed when a cutout is actually being made,
    // so it stays out of the bundle every screen pays for at startup.
    const { removeBackground } = await import("@imgly/background-removal");
    const raw = await removeBackground(imageDataUrl, { model: "isnet" });
    // Pieces of floor, shadows and haze the model kept: removed before the cutout is used.
    const blob = await cleanCutoutBlob(raw, imageDataUrl);
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(blob);
    });
    return { ok: true, imageDataUrl: dataUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
