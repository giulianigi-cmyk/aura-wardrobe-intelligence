// Naming a sampled colour for the Color Harmony tool. The palette lookup it used
// (nearestPaletteColor) measures plain RGB distance, which puts very dark colours together
// regardless of hue: a dark bottle green (#0A3831) came out as "Navy". Perceptual distance
// (CIEDE2000, the same measure the outfit scan uses) keeps the hue and names it as a green.
// Only used by the Color Harmony tool: wardrobe colour tagging keeps its own lookup.
import { COLOR_PALETTE, type PaletteColor } from "./color-palette";
import { deltaE2000, hexToLab } from "./outfit-match";

const PALETTE_LAB = COLOR_PALETTE.filter((c) => c.family !== "Multicolor").map((c) => ({ c, lab: hexToLab(c.hex) }));

const chroma = (l: { a: number; b: number }) => Math.hypot(l.a, l.b);
const hueDeg = (l: { a: number; b: number }) => ((Math.atan2(l.b, l.a) * 180) / Math.PI + 360) % 360;
const hueGap = (x: number, y: number) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));

/** A clearly coloured sample (chroma ≥ 10) is named among palette colours of a similar hue (±40°),
 *  so a dark colour isn't named after a grey or a colour of another hue just because both are dark;
 *  near-neutral samples use the whole palette. */
export function nearestPaletteColorPerceptual(hex: string): PaletteColor {
  const lab = hexToLab(hex);
  const chromatic = chroma(lab) >= 10;
  const sameHue = chromatic
    ? PALETTE_LAB.filter(({ lab: l }) => chroma(l) >= 10 && hueGap(hueDeg(l), hueDeg(lab)) <= 40)
    : [];
  const pool = sameHue.length ? sameHue : PALETTE_LAB;
  let best = pool[0].c;
  let bestD = Infinity;
  for (const { c, lab: l } of pool) {
    const d = deltaE2000(lab, l);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
