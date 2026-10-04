import type { WardrobeItem } from "./aura-types";
import { COLOR_PALETTE } from "./color-palette";

/** "Scansiona un outfit" → which piece of the wardrobe is the garment in the photo?
 *
 *  Two levels, kept apart on purpose:
 *  1. RETRIEVAL (this file, deterministic, no network): narrow the wardrobe down to a handful of
 *     plausible candidates from category, perceptual colour distance, subcategory, pattern tags,
 *     material and cut. It only decides WHO gets looked at, never the final answer: metadata can't
 *     tell a navy pinstripe trouser from a plain navy one, and the owner's wardrobe has ten
 *     "Jet Black Trousers" that metadata alone scores identically.
 *  2. VISUAL RERANKING (outfit-scan-match.functions.ts): the vision model compares the garment in
 *     the photo with the real pictures of those candidates and scores each one. `combineVisual`
 *     and `rankCandidates` below turn those scores into the percentage shown and the
 *     high / medium / low confidence that drives the existing review UI.
 *
 *  Replaces, for OutfitScan only, the old findBestMatch/findTopMatches path (outfit-dedupe.ts, which
 *  stays untouched for BatchReview, LogWear and the purchase advisor): there, colour was an exact
 *  name match (navy ≠ black but "Jet Black" = "Jet Black" for every black trouser), brand was always
 *  empty, so every same-category/colour/subcategory piece tied at 75% and the first one in the list
 *  won. */

// ---------------------------------------------------------------------------------------------
// Colour: CIEDE2000 distance between palette colours
// ---------------------------------------------------------------------------------------------

type Lab = { L: number; a: number; b: number };

export function hexToLab(hex: string): Lab {
  const n = parseInt(hex.replace("#", ""), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const [r, g, bl] = srgb;
  const x = (r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + bl * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

export function deltaE2000(p: Lab, q: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(p.a, p.b), C2 = Math.hypot(q.a, q.b);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1 = p.a * (1 + G), a2 = q.a * (1 + G);
  const C1p = Math.hypot(a1, p.b), C2p = Math.hypot(a2, q.b);
  const h = (a: number, b: number) => { if (a === 0 && b === 0) return 0; const d = Math.atan2(b, a) / rad; return d < 0 ? d + 360 : d; };
  const h1 = h(a1, p.b), h2 = h(a2, q.b);
  const dL = q.L - p.L, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lm = (p.L + q.L) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p !== 0) { hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/** Palette entries that describe a print rather than a colour; matched as patterns, not by ΔE. */
const PATTERN_PSEUDO_COLORS: Record<string, Pattern> = {
  "animal print": "animal", floral: "floral", striped: "stripes", checkered: "check", "tie dye": "print",
};

const LAB_BY_NAME = new Map<string, Lab>(
  COLOR_PALETTE.filter((c) => !(c.name.toLowerCase() in PATTERN_PSEUDO_COLORS)).map((c) => [c.name.toLowerCase(), hexToLab(c.hex)]),
);
// Older rows and hand-typed values sometimes use plain colour words instead of palette names.
const BASIC_COLOR_ALIASES: Record<string, string> = {
  black: "jet black", white: "pure white", grey: "slate grey", gray: "slate grey", blue: "royal blue",
  red: "cherry red", green: "forest green", brown: "chocolate", pink: "rose", yellow: "lemon",
  purple: "violet", orange: "orange", beige: "beige", navy: "navy",
};

function labOf(name: string): Lab | null {
  const n = name.trim().toLowerCase();
  return LAB_BY_NAME.get(n) ?? LAB_BY_NAME.get(BASIC_COLOR_ALIASES[n] ?? "") ?? null;
}

/** Lightness (CIE L*, 0 = black, 100 = white) of a named colour, null for unknown names. */
export function colorLightness(name: string): number | null {
  return labOf(name)?.L ?? null;
}

/** 1 = same colour, ~0.85 = near shade (jet vs soft black), ~0.5 = neighbouring colour that lighting
 *  can confuse (black vs navy), →0 = clearly different. Gaussian on ΔE2000 so small differences
 *  stay close to 1 and real differences fall off quickly. */
export function colorNameSimilarity(a: string, b: string): number | null {
  const la = labOf(a), lb = labOf(b);
  if (!la || !lb) return null;
  const d = deltaE2000(la, lb);
  return Math.exp(-((d / 16) ** 2));
}

/** Detected colours vs an item's colours. The first detected colour is the dominant one and weighs
 *  most; null when nothing is comparable (unknown names) so callers treat it as "no evidence". */
export function colorSimilarity(detected: string[], itemColors: string[]): number | null {
  const det = detected.filter((c) => labOf(c));
  const own = itemColors.filter((c) => labOf(c));
  if (!det.length || !own.length) return null;
  const best = (c: string) => Math.max(...own.map((o) => colorNameSimilarity(c, o) ?? 0));
  if (det.length === 1) return best(det[0]);
  return 0.75 * best(det[0]) + 0.25 * best(det[1]);
}

// ---------------------------------------------------------------------------------------------
// Pattern
// ---------------------------------------------------------------------------------------------

export const PATTERNS = [
  "solid", "pinstripe", "stripes", "check", "houndstooth", "floral", "animal", "polka dot",
  "geometric", "print", "textured", "other",
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** A wardrobe item's pattern is only known when its colours carry a print tag (Striped, Floral…);
 *  otherwise null — "unknown", not "solid". The visual reranker is what really checks patterns. */
export function itemPattern(item: Pick<WardrobeItem, "colors" | "color">): Pattern | null {
  const names = (item.colors?.length ? item.colors : item.color ? [item.color] : []).map((c) => c.toLowerCase());
  for (const n of names) if (n in PATTERN_PSEUDO_COLORS) return PATTERN_PSEUDO_COLORS[n];
  return null;
}

const PATTERN_FAMILY: Partial<Record<Pattern, string>> = { pinstripe: "stripe", stripes: "stripe", check: "check", houndstooth: "check" };

export function patternSimilarity(detected: Pattern | null | undefined, item: Pattern | null): number | null {
  if (!detected) return null;
  // Untagged item: prints are normally tagged (Striped, Floral…), so an untagged piece is most
  // likely plain — weak evidence either way, never as strong as a confirmed matching print.
  if (!item) return detected === "solid" || detected === "textured" ? 0.8 : 0.4;
  if (detected === item) return 1;
  const fd = PATTERN_FAMILY[detected], fi = PATTERN_FAMILY[item];
  if (fd && fd === fi) return 0.6;
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Level 1 — retrieval
// ---------------------------------------------------------------------------------------------

export type DetectedGarment = {
  category: string;
  subcategory?: string;
  colors: string[];
  pattern?: Pattern | null;
  materials?: string[];
  sleeveLength?: string;
  length?: string;
  fit?: string;
};

// Garments that people (and the detector) file under either category.
const CROSS_CATEGORY_SUBS = new Set(["Blazer", "Cardigan", "Shacket", "Vest", "Sweater"]);

export function categoryCompatible(d: DetectedGarment, item: WardrobeItem): boolean {
  if (!d.category || !item.category) return false;
  if (d.category === item.category) return true;
  const pair = new Set([d.category, item.category]);
  return pair.has("Tops") && pair.has("Outerwear") && !!d.subcategory && d.subcategory === item.subcategory && CROSS_CATEGORY_SUBS.has(d.subcategory);
}

/** Weighted average over the signals that are actually known for BOTH sides — an attribute nobody
 *  recorded is neither evidence for nor against. Colour dominates; same category + same colour
 *  alone is not enough to look like a sure thing (that is the visual stage's job). */
export function retrievalScore(d: DetectedGarment, item: WardrobeItem): number {
  if (!categoryCompatible(d, item)) return 0;
  const parts: { w: number; s: number }[] = [];
  const itemColors = item.colors?.length ? item.colors : item.color ? [item.color] : [];
  const cs = colorSimilarity(d.colors, itemColors);
  if (cs != null) parts.push({ w: 0.5, s: cs });
  if (d.subcategory && item.subcategory) parts.push({ w: 0.2, s: d.subcategory === item.subcategory ? 1 : 0 });
  const ps = patternSimilarity(d.pattern, itemPattern(item));
  if (ps != null) parts.push({ w: 0.15, s: ps });
  const dm = d.materials ?? [], im = item.material ?? [];
  if (dm.length && im.length) parts.push({ w: 0.05, s: dm.some((m) => im.includes(m)) ? 1 : 0 });
  const shape: number[] = [];
  if (d.fit && item.fit) shape.push(d.fit === item.fit ? 1 : 0);
  if (d.length && item.length) shape.push(d.length === item.length ? 1 : 0);
  if (d.sleeveLength && item.sleeve_length) shape.push(d.sleeveLength === item.sleeve_length ? 1 : 0);
  if (shape.length) parts.push({ w: 0.1, s: shape.reduce((a, b) => a + b, 0) / shape.length });
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  if (!wsum) return 0.3; // same category, nothing else known
  // Shrink towards a neutral 0.5 when little is known, so one lucky attribute can't look decisive.
  const known = Math.min(1, wsum / 0.7);
  return known * (parts.reduce((a, p) => a + p.w * p.s, 0) / wsum) + (1 - known) * 0.3;
}

export const RETRIEVAL_LIMIT = 6;
const RETRIEVAL_FLOOR = 0.2;

/** Up to `limit` plausible candidates, best first. `visualIds` (pgvector neighbours from the
 *  on-device embedding, when available) are always let in if their category fits, so an item whose
 *  metadata is wrong can still be found by its look. */
export function retrieveCandidates(
  d: DetectedGarment,
  wardrobe: WardrobeItem[],
  opts: { limit?: number; visualIds?: string[] } = {},
): { item: WardrobeItem; retrieval: number }[] {
  const limit = opts.limit ?? RETRIEVAL_LIMIT;
  const scored = wardrobe
    .map((item) => ({ item, retrieval: retrievalScore(d, item) }))
    .filter((r) => r.retrieval > 0);
  scored.sort((a, b) => b.retrieval - a.retrieval || a.item.id.localeCompare(b.item.id));
  const out = scored.filter((r) => r.retrieval >= RETRIEVAL_FLOOR).slice(0, limit);
  for (const id of opts.visualIds ?? []) {
    if (out.some((r) => r.item.id === id)) continue;
    const r = scored.find((s) => s.item.id === id);
    if (!r) continue;
    if (out.length < limit) out.push(r);
    else out[out.length - 1] = r; // replace the weakest metadata-only candidate
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Level 2 — combining the visual verdict, calibration, confidence
// ---------------------------------------------------------------------------------------------

/** What the vision model returns per candidate (0-100 each). */
export type VisualScore = {
  id: string;
  overall: number;
  color: number;
  pattern: number;
  silhouette: number;
  material: number;
  details: number;
  sameItem: "yes" | "maybe" | "no";
  reason: string;
};

type RawVisualScore = {
  ref: string; overall: number; color: number; pattern: number; silhouette: number; material: number; details: number;
  sameItem: string; reason?: string;
};

/** Maps the model's "C1…Cn" refs back to item ids. Unknown or repeated refs are dropped, so a
 *  confused answer can never attach a score to the wrong piece. */
export function mapVisualScores(raw: RawVisualScore[], ids: string[]): VisualScore[] {
  const seen = new Set<string>();
  const out: VisualScore[] = [];
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  for (const c of raw) {
    const m = /^C(\d+)$/i.exec(c.ref.trim());
    const id = m ? ids[Number(m[1]) - 1] : undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const same = c.sameItem.trim().toLowerCase();
    out.push({
      id,
      overall: clamp(c.overall), color: clamp(c.color), pattern: clamp(c.pattern),
      silhouette: clamp(c.silhouette), material: clamp(c.material), details: clamp(c.details),
      sameItem: same === "yes" ? "yes" : same === "no" ? "no" : "maybe",
      reason: (c.reason ?? "").trim().slice(0, 120),
    });
  }
  return out;
}

/** 0..1 match score from the visual verdict. The model's own overall judgement leads; the factor
 *  scores refine it; a clear colour or pattern mismatch, or an explicit "not the same item", caps
 *  the score below the "possible" band — same category + same colour can never paper over a
 *  visibly different garment. */
export function combineVisual(v: VisualScore): number {
  const c = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)) / 100;
  let s = 0.55 * c(v.overall) + 0.13 * c(v.color) + 0.12 * c(v.pattern) + 0.1 * c(v.silhouette) + 0.04 * c(v.material) + 0.06 * c(v.details);
  if (c(v.color) < 0.35 || c(v.pattern) < 0.35) s = Math.min(s, 0.55);
  if (c(v.silhouette) < 0.3) s = Math.min(s, 0.6);
  if (v.sameItem === "no") s = Math.min(s, 0.5);
  if (v.sameItem === "maybe") s = Math.min(s, 0.88);
  return Math.round(s * 1000) / 1000;
}

/** Without a visual check the metadata score is never allowed to look certain. */
export const NO_VISUAL_CAP = 0.74;

export const CONFIDENCE = { high: 0.85, medium: 0.65, alternativeFloor: 0.4, highMargin: 0.08 } as const;
export type MatchConfidence = "high" | "medium" | "low";

export type RankedCandidate = { item: WardrobeItem; score: number; reason?: string; sameItem?: VisualScore["sameItem"] };

export type MatchDecision = {
  confidence: MatchConfidence;
  /** null = no reliable match: the existing "new piece / choose from wardrobe / reconstruct" path. */
  match: RankedCandidate | null;
  /** Best first, at most 4, only ones worth showing. */
  candidates: RankedCandidate[];
  visualChecked: boolean;
};

/** The verdict for one detected garment.
 *  - HIGH: strong visual evidence (≥85%, the model says it is the same item, and a clear lead over
 *    the runner-up) → proposed directly.
 *  - MEDIUM: ≥65% → shown as the main guess with the alternatives next to it, user confirms.
 *  - LOW: nothing reaches 65% → no match is forced; weaker alternatives are still listed. */
export function rankCandidates(
  retrieved: { item: WardrobeItem; retrieval: number }[],
  visual: VisualScore[] | null,
): MatchDecision {
  const byId = new Map((visual ?? []).map((v) => [v.id, v]));
  const visualChecked = !!visual && visual.length > 0;
  const ranked: RankedCandidate[] = retrieved.map(({ item, retrieval }) => {
    const v = byId.get(item.id);
    if (v) return { item, score: combineVisual(v), reason: v.reason?.trim() || undefined, sameItem: v.sameItem };
    // Not visually checked (call failed, or the model skipped it): metadata only, scaled into
    // 0..NO_VISUAL_CAP — order preserved, but only a full metadata match reaches "medium" and
    // nothing reaches "high". When the others WERE checked, lower still so it can't outrank them.
    return { item, score: Math.round(NO_VISUAL_CAP * retrieval * (visualChecked ? 0.85 : 1) * 1000) / 1000 };
  });
  ranked.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const candidates = ranked.filter((r) => r.score >= CONFIDENCE.alternativeFloor).slice(0, 4);
  const top = ranked[0];
  if (!top || top.score < CONFIDENCE.medium) return { confidence: "low", match: null, candidates, visualChecked };
  const second = ranked[1]?.score ?? 0;
  const high = visualChecked && top.sameItem === "yes" && top.score >= CONFIDENCE.high && top.score - second >= CONFIDENCE.highMargin;
  return { confidence: high ? "high" : "medium", match: top, candidates, visualChecked };
}

/** Same bands for a candidate the user switches to by hand. */
export function verdictForScore(score: number): "certain" | "maybe" | "new" {
  return score >= CONFIDENCE.high ? "certain" : score >= CONFIDENCE.medium ? "maybe" : "new";
}
