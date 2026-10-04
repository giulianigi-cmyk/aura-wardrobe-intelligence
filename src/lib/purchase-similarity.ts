// Which owned pieces a product the person is considering really resembles. The advisor used to call
// a Cartier ring "too similar to something you own" because the only Cartier pieces owned were two
// watches: same category (Accessories), same brand, a colour in common. A ring is not a watch. Only
// pieces of the same KIND (same subcategory — ring with ring, loafers with loafers) can be similar,
// and the owned piece is named, so the person can see what the comparison is about.
import { scoreMatch, type DedupeVerdict } from "./outfit-dedupe";
import { colorNameSimilarity } from "./outfit-match";
import type { WardrobeItem } from "./aura-types";

type ProductShape = {
  category: string | null; subcategory: string | null; colors: string[]; brand: string | null;
  /** Free text that can reveal details: title, description, style tags, material. */
  text?: string | null;
  fit?: string | null;
  length?: string | null;
};

import { detailsIn, DETAIL_WORDS_FOR_KEY } from "./garment-details";

export function ownedText(it: WardrobeItem): string {
  const x = it as WardrobeItem & { closure?: string | null; toe_shape?: string | null };
  // `details` holds the detail keys the photo analysis found (garment-details.ts); written as
  // words so detailsIn() reads them like any other text.
  const details = ((it as { details?: string[] | null }).details ?? []).map((d) => DETAIL_WORDS_FOR_KEY[d] ?? d);
  return [it.subcategory, it.model, ...(it.style_tags ?? []), ...(Array.isArray(it.material) ? it.material : []), x.closure, x.toe_shape, (it as { name?: string | null }).name, ...details]
    .filter(Boolean).join(" ");
}

/** Categories whose pieces are so different from one another (a ring vs a watch, a tote vs a
 *  clutch) that without a known type nothing can be called similar. */
const TYPE_REQUIRED = new Set(["Accessories", "Bags", "Shoes"]);

/** Owned pieces of the same kind as the product. */
export function comparablePieces(product: ProductShape, wardrobe: WardrobeItem[]): WardrobeItem[] {
  if (!product.category) return [];
  const sameCategory = wardrobe.filter((it) => it.category === product.category && !(it as { archived?: boolean }).archived);
  if (product.subcategory) {
    return sameCategory.filter((it) => it.subcategory === product.subcategory || (!it.subcategory && !TYPE_REQUIRED.has(product.category!)));
  }
  return TYPE_REQUIRED.has(product.category) ? [] : sameCategory;
}

/** "Brand · colour · type · model" for an owned piece. */
export function ownedPieceLabel(it: WardrobeItem): string {
  return [it.brand, it.colors?.[0] ?? it.color, it.subcategory || it.category, it.model].filter(Boolean).join(" · ");
}

export type SimilarOwned = { verdict: Exclude<DedupeVerdict, "new">; itemId: string; label: string };
/** The closest owned piece of the same kind and what the product has that it doesn't. */
export type ClosestOwned = { itemId: string; label: string; differences: string[]; rawVerdict: Exclude<DedupeVerdict, "new"> };

/** Details the product has that a given owned piece doesn't (slingback, patent…). */
export function differencesFrom(product: ProductShape, owned: WardrobeItem): string[] {
  const mine = detailsIn([product.subcategory, product.text].filter(Boolean).join(" "));
  const theirs = detailsIn(ownedText(owned));
  return [...mine].filter((k) => !theirs.has(k));
}

export function closestOwnedPiece(product: ProductShape, wardrobe: WardrobeItem[]): ClosestOwned | null {
  if (!product.category) return null;
  const candidates = comparablePieces(product, wardrobe);
  if (!candidates.length) return null;
  const detected = { category: product.category, subcategory: product.subcategory ?? undefined, colors: product.colors, brand: product.brand };
  const scored = candidates.map((it) => ({ it, score: scoreMatch(detected, it) }));
  const best = Math.max(...scored.map((x) => x.score));
  const verdict: DedupeVerdict = best >= 0.9 ? "certain" : best >= 0.6 ? "maybe" : "new";
  if (verdict === "new") return null;
  // Among the pieces that score the same on brand / colour / type (ten denim-wash jeans tie), pick the
  // one that really looks most like the product: closest colours, same fit and length, and no
  // details the product doesn't have (crystals, a logo, a silver accent). The first one in the list
  // used to win — an embellished pair next to a plain one.
  const mine = detailsIn([product.subcategory, product.text].filter(Boolean).join(" "));
  const refine = (it: WardrobeItem) => {
    const theirs = detailsIn(ownedText(it));
    const extraDetails = [...theirs].filter((k) => !mine.has(k)).length;
    const colors = it.colors?.length ? it.colors : it.color ? [it.color] : [];
    const colorFit = product.colors.length && colors.length
      ? colors.reduce((sum, c) => sum + Math.max(...product.colors.map((p) => (p === c ? 1 : colorNameSimilarity(p, c) ?? 0))), 0) / colors.length
      : 0;
    const fit = product.fit && it.fit && product.fit === it.fit ? 0.1 : 0;
    const length = product.length && it.length && product.length === it.length ? 0.05 : 0;
    return colorFit * 0.3 + fit + length - extraDetails * 0.15;
  };
  const tied = scored.filter((x) => x.score >= best - 0.05).sort((a, b) => refine(b.it) - refine(a.it) || b.score - a.score);
  const match = tied[0].it;
  const theirs = detailsIn(ownedText(match));
  const differences = [...mine].filter((k) => !theirs.has(k));
  return { itemId: match.id, label: ownedPieceLabel(match), differences, rawVerdict: verdict };
}

/** The owned piece the product is a (near-)duplicate of, compared only with pieces of the same kind.
 *  A real difference in detail (slingback vs closed, patent vs plain leather) lowers the call by one
 *  step: a "certain" duplicate becomes "similar", a "similar" one is not called similar at all. */
export function similarOwnedPiece(product: ProductShape, wardrobe: WardrobeItem[]): (SimilarOwned & { differences: string[] }) | null {
  const c = closestOwnedPiece(product, wardrobe);
  if (!c) return null;
  const verdict = c.differences.length ? (c.rawVerdict === "certain" ? "maybe" : null) : c.rawVerdict;
  return verdict ? { verdict, itemId: c.itemId, label: c.label, differences: c.differences } : null;
}
