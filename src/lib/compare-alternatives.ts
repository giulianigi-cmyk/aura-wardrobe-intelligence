// "Compra una o l'altra": two pieces in the same comparison that do the same job (same kind, same
// colour — e.g. two black patent Louboutin heels) replace each other. The advisor used to judge
// every piece only against the wardrobe, so it could say "buy" to both. Here alternatives are
// grouped and the one that adds MORE to the wardrobe is preferred: a detail nothing owned has (a
// slingback when no slingback is owned) beats a variant of a piece already owned (a patent pump
// next to the black pump in the wardrobe).

import { colorNameSimilarity } from "./outfit-match";

export type CompareCandidate = {
  category: string | null;
  subcategory: string | null;
  colors: string[];
  /** Details of the product that no owned piece of the same category has. */
  novelDetails: string[];
  /** Nothing of this kind owned at all. */
  wardrobeGap: boolean;
  /** What it adds vs the closest owned piece of the same kind. */
  differences: string[];
  /** A certain duplicate of an owned piece. */
  duplicate: boolean;
  pairsWithCount: number;
};

function sameColour(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => x === y || (colorNameSimilarity(x, y) ?? 0) >= 0.7));
}

/** Same job: same category, same type (or one unknown), a colour in common. */
export function areAlternatives(a: CompareCandidate, b: CompareCandidate): boolean {
  if (!a.category || a.category !== b.category) return false;
  if (a.subcategory && b.subcategory && a.subcategory !== b.subcategory) return false;
  return sameColour(a.colors, b.colors);
}

/** How much a piece adds to the wardrobe (higher = more). */
export function novelty(c: CompareCandidate): number {
  return 3 * c.novelDetails.length + (c.wardrobeGap ? 4 : 0) + c.differences.length - (c.duplicate ? 6 : 0);
}

export type AlternativeGroup = { preferred: number; others: number[] };

/** Groups of mutually replaceable pieces (indices), each with the piece to prefer. */
export function alternativeGroups(items: CompareCandidate[]): AlternativeGroup[] {
  const seen = new Set<number>();
  const groups: AlternativeGroup[] = [];
  for (let i = 0; i < items.length; i++) {
    if (seen.has(i)) continue;
    const members = [i];
    for (let j = i + 1; j < items.length; j++) {
      if (!seen.has(j) && members.some((m) => areAlternatives(items[m], items[j]))) members.push(j);
    }
    if (members.length < 2) continue;
    members.forEach((m) => seen.add(m));
    const best = [...members].sort((a, b) => novelty(items[b]) - novelty(items[a]) || items[b].pairsWithCount - items[a].pairsWithCount || a - b)[0];
    groups.push({ preferred: best, others: members.filter((m) => m !== best) });
  }
  return groups;
}
