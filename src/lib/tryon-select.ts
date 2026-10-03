// Virtual try-on applies one garment per step and accepts at most MAX_TRYON_ITEMS. Outfits from the
// stylist, the calendar or a scan often have more pieces (earrings, watch, sunglasses...), and the
// whole list used to be sent: the server rejected it and the person saw a raw validation error.
// This keeps the pieces that matter most on the body, in the outfit's own order.

export const MAX_TRYON_ITEMS = 6;

type TryOnCandidate = { id: string; category: string | null; subcategory?: string | null };

const WEARABLE_ACCESSORIES = new Set(["hat", "cap", "sunglasses", "belt", "scarf", "gloves"]);

function priority(it: TryOnCandidate): number {
  const c = it.category ?? "";
  if (["Dresses", "Jumpsuits", "Tops", "Bottoms", "Outerwear", "Activewear", "Swimwear", "Underwear"].includes(c)) return 0;
  if (c === "Shoes") return 1;
  if (c === "Bags") return 2;
  if (c === "Accessories" && WEARABLE_ACCESSORIES.has((it.subcategory ?? "").toLowerCase())) return 3;
  return 4; // jewellery, watches, anything else small
}

/** The pieces to put on the avatar (at most MAX_TRYON_ITEMS) and the ones left out. */
export function selectTryOnItems<T extends TryOnCandidate>(items: T[], max = MAX_TRYON_ITEMS): { kept: T[]; dropped: T[] } {
  if (items.length <= max) return { kept: items, dropped: [] };
  const ranked = items.map((it, i) => ({ it, i, p: priority(it) })).sort((a, b) => a.p - b.p || a.i - b.i);
  const keep = new Set(ranked.slice(0, max).map((x) => x.i));
  return {
    kept: items.filter((_, i) => keep.has(i)),
    dropped: items.filter((_, i) => !keep.has(i)),
  };
}
