import { removeBackground } from "@imgly/background-removal";

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
    const blob = await removeBackground(imageDataUrl, { model: "isnet" });
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
