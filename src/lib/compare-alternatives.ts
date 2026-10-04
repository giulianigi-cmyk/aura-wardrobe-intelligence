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
  /** For telling the SAME product apart from two similar ones (optional). */
  brand?: string | null;
  title?: string | null;
  priceEur?: number | null;
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

export type AlternativeGroup = { preferred: number; others: number[]; /** The same product (e.g. on two sites): the cheaper is preferred. */ identical?: boolean };

const brandKey = (b: string | null | undefined) => (b ?? "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
// Words that say what kind of piece it is, its colour or material — not which model it is.
const GENERIC = new Set([
  "sandali", "sandalo", "sandal", "sandals", "scarpe", "scarpa", "shoes", "shoe", "decollete", "pumps", "pump", "tacco", "heel", "heels",
  "borsa", "bag", "jeans", "jean", "abito", "dress", "camicia", "shirt", "maglia", "maglione", "sweater", "giacca", "jacket", "cappotto", "coat",
  "con", "with", "and", "the", "per", "donna", "woman", "women", "nuovo", "new", "mini", "midi", "maxi",
  "cristalli", "crystals", "crystal", "pelle", "leather", "raso", "satin", "suede", "camoscio", "seta", "silk", "vernice", "patent",
  "nero", "nera", "neri", "nere", "black", "bianco", "white", "azzurro", "azzurri", "blue", "blu", "rosso", "red", "vinaccia", "argento", "silver", "oro", "gold",
]);
function modelTokens(title: string | null | undefined, brand: string | null | undefined): Set<string> {
  const b = new Set((brand ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/));
  return new Set((title ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w) && !b.has(w)));
}

/** The same product, possibly sold on different sites at different prices: same brand, same kind
 *  and colour, and nothing in the names telling two models apart (one name generic, like
 *  "Sandali", or a model name in common, like "Ellabrita"). */
export function sameProduct(a: CompareCandidate, b: CompareCandidate): boolean {
  if (!areAlternatives(a, b)) return false;
  if (!brandKey(a.brand) || brandKey(a.brand) !== brandKey(b.brand)) return false;
  const ta = modelTokens(a.title, a.brand), tb = modelTokens(b.title, b.brand);
  if (!ta.size || !tb.size) return true;
  return [...ta].some((w) => tb.has(w));
}

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
    // The same product twice: only the price differs, so the cheaper one is the one to buy.
    const identical = members.every((m) => m === members[0] || sameProduct(items[members[0]], items[m]));
    const price = (i: number) => items[i].priceEur ?? Number.POSITIVE_INFINITY;
    const best = identical
      ? [...members].sort((a, b) => price(a) - price(b) || a - b)[0]
      : [...members].sort((a, b) => novelty(items[b]) - novelty(items[a]) || items[b].pairsWithCount - items[a].pairsWithCount || a - b)[0];
    groups.push({ preferred: best, others: members.filter((m) => m !== best), ...(identical ? { identical: true } : {}) });
  }
  return groups;
}

// Order of the comparison. Within the same verdict the person expects the piece with MORE going for
// it first: more positive features (iconic, timeless, status, on trend, versatile), a real gap or
// nothing similar owned, something new it adds. The model used to pick this order itself and could
// put a piece with fewer strengths first (Miss Z above the Rene Caovilla Cleo, which is iconic and
// unlike anything owned); now it is computed here and the model only explains it.

export type RankingCandidate = CompareCandidate & {
  fashion: { iconic: boolean; timeless: boolean; onTrend: boolean; statusPiece: boolean; versatility: "low" | "medium" | "high" } | null;
  /** Something similar (not necessarily a duplicate) is already owned. */
  similarOwned: boolean;
};

/** Positive fashion features, an iconic design weighing double. */
export function positiveFeatures(f: RankingCandidate["fashion"]): number {
  if (!f) return 0;
  return (f.iconic ? 2 : 0) + (f.timeless ? 1 : 0) + (f.statusPiece ? 1 : 0) + (f.onTrend ? 1 : 0) + (f.versatility === "high" ? 1 : f.versatility === "low" ? -1 : 0);
}

/** How strong a choice it is (higher = better). What it adds counts at most 2, so a long list of
 *  small differences can't outweigh the piece's own qualities. */
export function strengthScore(c: RankingCandidate): number {
  const gap = c.wardrobeGap ? 3 : c.duplicate ? -3 : c.similarOwned ? 0 : 1;
  const adds = Math.min(new Set([...c.novelDetails, ...c.differences]).size, 2);
  return positiveFeatures(c.fashion) + gap + adds;
}

/** Full order, best first: by tier (fixed), then strength, then pairings; within a group of
 *  alternatives the preferred piece always comes before the ones it replaces. */
export function compareRanking(items: RankingCandidate[], tiers: number[], groups: AlternativeGroup[]): number[] {
  const score = items.map(strengthScore);
  for (const g of groups) for (const o of g.others) score[o] = Math.min(score[o], score[g.preferred] - 0.5);
  return items.map((_, i) => i).sort((a, b) =>
    tiers[b] - tiers[a] || score[b] - score[a] || items[b].pairsWithCount - items[a].pairsWithCount || a - b);
}
