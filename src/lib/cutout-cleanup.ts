// Clean-up of the free, in-browser cutout (bg-removal-client.ts). On photos taken on a floor or a
// bed the model often keeps pieces of the background: a patch of floor detached from the garment,
// a pale shadow under the hem, a faint haze around it. Those are saved with the item and show up
// in the wardrobe and on every canvas. This pass removes them, on plain RGBA pixels (no DOM), so
// it is the same for every photo and testable:
//   1. pixels that are only partly opaque AND the colour of the photo's background (estimated
//      from the original photo's border) are background residue: made transparent. Solid pixels
//      are never touched, so a garment the same colour as the floor keeps its body;
//   2. near-invisible haze (alpha under HAZE_ALPHA) is made transparent;
//   3. visible regions not connected to the garment and much smaller than it (under
//      ISLAND_RATIO of the largest region) are removed; regions of comparable size are kept, so
//      pairs (shoes, earrings) and multi-piece items stay whole.

export type Rgb = [number, number, number];

const HAZE_ALPHA = 32;
const SOLID_ALPHA = 230;
const BG_COLOR_DISTANCE = 48;
const ISLAND_RATIO = 0.05;
/** The photo border must be this uniform (mean distance from its median colour) to be trusted. */
const BG_MAX_SPREAD = 36;

const dist = (r: number, g: number, b: number, c: Rgb) => Math.hypot(r - c[0], g - c[1], b - c[2]);

/** The background colour of the ORIGINAL photo, from its outer border, or null when the border is
 *  not a fairly uniform colour (busy background: no colour rule is safe then). */
export function estimateBackground(rgba: Uint8ClampedArray, w: number, h: number): Rgb | null {
  if (w < 4 || h < 4) return null;
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.03));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const step = Math.max(1, Math.round((w + h) / 400));
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (rgba[i + 3] < 200) return; // already transparent: not a photo border
    rs.push(rgba[i]); gs.push(rgba[i + 1]); bs.push(rgba[i + 2]);
  };
  for (let d = 0; d < band; d++) {
    for (let x = 0; x < w; x += step) { take(x, d); take(x, h - 1 - d); }
    for (let y = 0; y < h; y += step) { take(d, y); take(w - 1 - d, y); }
  }
  if (rs.length < 20) return null;
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const c: Rgb = [med(rs.slice()), med(gs.slice()), med(bs.slice())];
  let spread = 0;
  for (let i = 0; i < rs.length; i++) spread += dist(rs[i], gs[i], bs[i], c);
  return spread / rs.length <= BG_MAX_SPREAD ? c : null;
}

/** Cleans a cutout in place (RGBA, straight alpha). Returns how many pixels became transparent. */
export function cleanCutout(rgba: Uint8ClampedArray, w: number, h: number, bg: Rgb | null): number {
  const n = w * h;
  let cleared = 0;
  const clear = (p: number) => { if (rgba[p * 4 + 3] !== 0) { rgba[p * 4 + 3] = 0; cleared++; } };

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = rgba[i + 3];
    if (a === 0) continue;
    if (a < HAZE_ALPHA) { clear(p); continue; }
    if (bg && a < SOLID_ALPHA && dist(rgba[i], rgba[i + 1], rgba[i + 2], bg) < BG_COLOR_DISTANCE) clear(p);
  }

  // Connected visible regions (8-neighbourhood).
  const label = new Int32Array(n);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let p = 0; p < n; p++) {
    if (label[p] || rgba[p * 4 + 3] === 0) continue;
    const id = sizes.length;
    let size = 0;
    label[p] = id;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      size++;
      const x = q % w, y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          const r = yy * w + xx;
          if (!label[r] && rgba[r * 4 + 3] !== 0) { label[r] = id; stack.push(r); }
        }
      }
    }
    sizes.push(size);
  }
  let largest = 0;
  for (const s of sizes) if (s > largest) largest = s;
  if (largest === 0) return cleared;
  const keep = sizes.map((s) => s >= largest * ISLAND_RATIO);
  for (let p = 0; p < n; p++) if (label[p] && !keep[label[p]]) clear(p);
  return cleared;
}
