// Which owned pieces a product the person is considering really resembles. The advisor used to call
// a Cartier ring "too similar to something you own" because the only Cartier pieces owned were two
// watches: same category (Accessories), same brand, a colour in common. A ring is not a watch. Only
// pieces of the same KIND (same subcategory — ring with ring, loafers with loafers) can be similar,
// and the owned piece is named, so the person can see what the comparison is about.
import { findBestMatch, type DedupeVerdict } from "./outfit-dedupe";
import type { WardrobeItem } from "./aura-types";

type ProductShape = { category: string | null; subcategory: string | null; colors: string[]; brand: string | null };

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

/** The owned piece the product is a (near-)duplicate of, compared only with pieces of the same kind. */
export function similarOwnedPiece(product: ProductShape, wardrobe: WardrobeItem[]): SimilarOwned | null {
  if (!product.category) return null;
  const candidates = comparablePieces(product, wardrobe);
  if (!candidates.length) return null;
  const d = findBestMatch(
    { category: product.category, subcategory: product.subcategory ?? undefined, colors: product.colors, brand: product.brand },
    candidates,
  );
  if (d.verdict === "new" || !d.match) return null;
  return { verdict: d.verdict, itemId: d.match.id, label: ownedPieceLabel(d.match) };
}
