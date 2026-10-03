// Which owned pieces a product the person is considering really resembles. The advisor used to call
// a Cartier ring "too similar to something you own" because the only Cartier pieces owned were two
// watches: same category (Accessories), same brand, a colour in common. A ring is not a watch. Only
// pieces of the same KIND (same subcategory — ring with ring, loafers with loafers) can be similar,
// and the owned piece is named, so the person can see what the comparison is about.
import { findBestMatch, type DedupeVerdict } from "./outfit-dedupe";
import type { WardrobeItem } from "./aura-types";

type ProductShape = {
  category: string | null; subcategory: string | null; colors: string[]; brand: string | null;
  /** Free text that can reveal details: title, description, style tags, material. */
  text?: string | null;
};

import { detailsIn, DETAIL_WORDS_FOR_KEY } from "./garment-details";

function ownedText(it: WardrobeItem): string {
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

export function closestOwnedPiece(product: ProductShape, wardrobe: WardrobeItem[]): ClosestOwned | null {
  if (!product.category) return null;
  const candidates = comparablePieces(product, wardrobe);
  if (!candidates.length) return null;
  const d = findBestMatch(
    { category: product.category, subcategory: product.subcategory ?? undefined, colors: product.colors, brand: product.brand },
    candidates,
  );
  if (d.verdict === "new" || !d.match) return null;
  const mine = detailsIn([product.subcategory, product.text].filter(Boolean).join(" "));
  const theirs = detailsIn(ownedText(d.match));
  const differences = [...mine].filter((k) => !theirs.has(k));
  return { itemId: d.match.id, label: ownedPieceLabel(d.match), differences, rawVerdict: d.verdict };
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
