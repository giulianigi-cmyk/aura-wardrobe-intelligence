import type { WardrobeItem } from "./aura-types";

export type DedupeVerdict = "new" | "maybe" | "certain";

export type DedupeResult = {
  verdict: DedupeVerdict;
  score: number;
  match: WardrobeItem | null;
};

/** Attribute-based duplicate detection for outfit-scan results.
 *  Purely structural (category + color + subcategory + brand overlap) —
 *  no image embeddings yet. Cheap, deterministic, explainable, and a
 *  reasonable first pass before a future visual-similarity upgrade.
 *
 *  Thresholds: >=0.9 certain duplicate (don't add, link to existing),
 *  0.6-0.9 maybe (ask the user to confirm), <0.6 treated as a new item.
 *
 *  Category + color + subcategory alone — the only signal a phone-photo
 *  scan can realistically produce — must land in "maybe" territory, not
 *  "certain": two black bodycon dresses can be genuinely different
 *  garments (material, cut, embellishment), and "certain" silently
 *  excludes an item from being saved by default. Only a brand match on
 *  top of the rest is specific enough to cross into "certain". */
export function scoreMatch(
  detected: { category: string; subcategory?: string; colors: string[]; brand?: string | null },
  existing: WardrobeItem,
): number {
  if (!detected.category || detected.category !== existing.category) return 0;

  let score = 0.25; // same category baseline

  const existingColors = existing.colors?.length ? existing.colors : (existing.color ? [existing.color] : []);
  const colorOverlap = detected.colors.some((c) => existingColors.includes(c));
  if (colorOverlap) score += 0.25;

  const existingSub = existing.subcategory ?? "";
  if (detected.subcategory && existingSub && detected.subcategory === existingSub) score += 0.25;

  const db = detected.brand?.trim().toLowerCase();
  const eb = existing.brand?.trim().toLowerCase();
  if (db && eb && db === eb) score += 0.25;

  return Math.min(1, score);
}

export function findBestMatch(
  detected: { category: string; subcategory?: string; colors: string[]; brand?: string | null },
  wardrobe: WardrobeItem[],
): DedupeResult {
  let best: WardrobeItem | null = null;
  let bestScore = 0;
  for (const existing of wardrobe) {
    const s = scoreMatch(detected, existing);
    if (s > bestScore) { bestScore = s; best = existing; }
  }
  const verdict: DedupeVerdict = bestScore >= 0.9 ? "certain" : bestScore >= 0.6 ? "maybe" : "new";
  return { verdict, score: bestScore, match: verdict === "new" ? null : best };
}

/** Same scoring as findBestMatch above (scoreMatch is untouched), but
 *  returns the top N candidates instead of just the best one — added
 *  for the "maybe, but let me pick a different one" step in wear
 *  confirmation, where showing only the single top guess isn't enough;
 *  the person needs real alternatives from their own wardrobe, not a
 *  manual search through 300+ items. Never used by the existing
 *  duplicate-on-import flow (OutfitScan.tsx/BatchReview.tsx keep using
 *  findBestMatch exactly as before), so nothing there changes behavior. */
export function findTopMatches(
  detected: { category: string; subcategory?: string; colors: string[]; brand?: string | null },
  wardrobe: WardrobeItem[],
  n = 3,
): { item: WardrobeItem; score: number; verdict: DedupeVerdict }[] {
  return wardrobe
    .map((item) => ({ item, score: scoreMatch(detected, item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ item, score }) => ({
      item, score,
      verdict: (score >= 0.9 ? "certain" : score >= 0.6 ? "maybe" : "new") as DedupeVerdict,
    }));
}
