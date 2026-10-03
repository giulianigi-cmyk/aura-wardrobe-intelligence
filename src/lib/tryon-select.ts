// Virtual try-on applies one garment per step and accepts at most MAX_TRYON_ITEMS. Outfits from the
// stylist, the calendar or a scan often have more pieces (earrings, watch, sunglasses...), and the
// whole list used to be sent: the server rejected it and the person saw a raw validation error.
// The avatar focuses on what reads on a full-body image: garments, shoes, bags and statement
// jewellery. Small jewellery (a thin bracelet, a ring, a watch, an anklet, a brooch) is left out —
// it doesn't show and costs a whole try-on step.

export const MAX_TRYON_ITEMS = 6;

export type TryOnCandidate = {
  id: string;
  category: string | null;
  subcategory?: string | null;
  style_tags?: string[] | null;
  material?: string[] | null;
};

const WEARABLE_ACCESSORIES = new Set(["hat", "cap", "sunglasses", "belt", "scarf", "gloves"]);
// Visible jewellery: kept when there is room.
const VISIBLE_JEWELLERY = new Set(["earrings", "necklace"]);
// Small jewellery: never worth a try-on step unless tagged as a statement piece.
const SMALL_JEWELLERY = new Set(["bracelet", "ring", "anklet", "brooch", "watch", "hair accessory"]);
const STATEMENT = /statement|oversize|maxi|chunky|\bxl\b|bold|vistos|choker|plastron|bib|cuff|chandelier|collier/i;

function isStatement(it: TryOnCandidate): boolean {
  return STATEMENT.test([...(it.style_tags ?? []), ...(it.material ?? []), it.subcategory ?? ""].join(" "));
}

/** Lower = tried on first; null = left out. */
function priority(it: TryOnCandidate): number | null {
  const c = it.category ?? "";
  const sub = (it.subcategory ?? "").toLowerCase();
  if (["Dresses", "Jumpsuits", "Tops", "Bottoms", "Outerwear", "Activewear", "Swimwear", "Underwear"].includes(c)) return 0;
  if (c === "Shoes") return 1;
  if (c === "Bags") return 2;
  if (c === "Accessories") {
    if (SMALL_JEWELLERY.has(sub)) return isStatement(it) ? 3 : null;
    if (VISIBLE_JEWELLERY.has(sub)) return isStatement(it) ? 3 : 4;
    if (WEARABLE_ACCESSORIES.has(sub)) return 3;
    return 4;
  }
  return 4;
}

/** The pieces to put on the avatar (at most MAX_TRYON_ITEMS, outfit order kept) and the ones left out. */
export function selectTryOnItems<T extends TryOnCandidate>(items: T[], max = MAX_TRYON_ITEMS): { kept: T[]; dropped: T[] } {
  const ranked = items
    .map((it, i) => ({ it, i, p: priority(it) }))
    .filter((x): x is { it: T; i: number; p: number } => x.p !== null)
    .sort((a, b) => a.p - b.p || a.i - b.i);
  // Never leave the avatar with nothing to wear: if only small jewellery was chosen, try it on.
  const pool = ranked.length ? ranked : items.map((it, i) => ({ it, i, p: 0 }));
  const keep = new Set(pool.slice(0, max).map((x) => x.i));
  return {
    kept: items.filter((_, i) => keep.has(i)),
    dropped: items.filter((_, i) => !keep.has(i)),
  };
}
