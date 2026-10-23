/** A photo flattened onto a white background, at most `maxSide` px on its longest side, as a JPEG
 *  data URL. For remove.bg: a piece already saved as a cutout is a transparent PNG with a ragged
 *  light rim, which remove.bg answered with a 400; on white it reads as an ordinary product photo
 *  (the rim melts into the background and is removed with it), and a smaller file stays within its
 *  size limits. Falls back to the input when the image cannot be drawn. */
export async function flattenOnWhite(dataUrl: string, maxSide = 2000): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = dataUrl;
    });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", 0.92);
    c.width = 0; c.height = 0;
    return out;
  } catch {
    return dataUrl;
  }
}
