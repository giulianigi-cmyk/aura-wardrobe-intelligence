// Virtual try-on applies one garment per step and accepts at most MAX_TRYON_ITEMS. The avatar wears
// clothes and shoes only: bags and accessories (jewellery, watches, belts, sunglasses, hats, scarves)
// are never tried on. Each costs a whole try-on step, adds little on a full-body image, and every
// extra step in the chain alters the face a little more. The person is told they are left out.

export const MAX_TRYON_ITEMS = 6;

export type TryOnCandidate = {
  id: string;
  category: string | null;
  subcategory?: string | null;
  style_tags?: string[] | null;
  material?: string[] | null;
};

/** Bags and accessories: never put on the avatar. */
export function isNotWornOnAvatar(it: { category: string | null }): boolean {
  return it.category === "Bags" || it.category === "Accessories";
}

/** Lower = tried on first. */
function priority(it: TryOnCandidate): number {
  const c = it.category ?? "";
  if (["Dresses", "Jumpsuits", "Tops", "Bottoms", "Outerwear", "Activewear", "Swimwear", "Underwear"].includes(c)) return 0;
  if (c === "Shoes") return 1;
  return 2;
}

/** The pieces to put on the avatar (at most MAX_TRYON_ITEMS, outfit order kept), the bags and
 *  accessories left out, and the clothes left out only because there were more than the maximum. */
export function selectTryOnItems<T extends TryOnCandidate>(items: T[], max = MAX_TRYON_ITEMS): { kept: T[]; accessories: T[]; overLimit: T[] } {
  const accessories = items.filter(isNotWornOnAvatar);
  const ranked = items
    .map((it, i) => ({ it, i, p: priority(it) }))
    .filter((x) => !isNotWornOnAvatar(x.it))
    .sort((a, b) => a.p - b.p || a.i - b.i);
  const keep = new Set(ranked.slice(0, max).map((x) => x.i));
  return {
    kept: items.filter((_, i) => keep.has(i)),
    accessories,
    overLimit: ranked.slice(max).map((x) => x.it),
  };
}

// ---- Layering order and styling for the try-on chain ----
// Each try-on step dresses the result of the previous one, so ORDER is layering: what goes
// underneath must come first. A shirt applied before a dress was covered by it; a shirt applied
// after it came out buttoned closed over it, hiding the dress.

type Layerable = { category: string | null; subcategory?: string | null };

// Tops worn as an open layer over something else (button-front or knit layers).
const OVER_TOPS = new Set(["shirt", "blouse", "cardigan", "sweater", "hoodie", "sweatshirt", "tunic"]);
const OPEN_FRONT_TOPS = new Set(["shirt", "blouse", "cardigan"]);

function layerRank(it: Layerable): number {
  const c = it.category ?? "";
  const sub = (it.subcategory ?? "").toLowerCase();
  if (c === "Underwear" || c === "Swimwear") return 0;
  if (c === "Dresses" || c === "Jumpsuits") return 1;
  if (c === "Tops" || c === "Activewear") return OVER_TOPS.has(sub) ? 4 : 2;
  if (c === "Bottoms") return 3;
  if (c === "Outerwear") return 5;
  if (c === "Shoes") return 6;
  if (c === "Bags") return 7;
  return 8;
}

/** Try-on order: underneath first (dress, base top), then bottoms, then layers worn over them,
 *  outerwear, shoes, bag, accessories. Stable for pieces of the same layer. */
export function orderForTryOn<T extends Layerable>(items: T[]): T[] {
  return items.map((it, i) => ({ it, i, r: layerRank(it) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.it);
}

/** What lies under an open-front top — or a jacket, blazer or coat — in this outfit, if anything.
 *  A jacket over a dress is handled by its own hint (worn open or on the shoulders); over a top it is
 *  worn open, so the top it was chosen with stays visible. */
export function underLayerFor(item: Layerable, outfit: Layerable[]): "dress" | "top" | null {
  if (item.category === "Outerwear") {
    if (outfit.some((o) => o.category === "Dresses" || o.category === "Jumpsuits")) return null;
    return outfit.some((o) => o !== item && (o.category === "Tops" || o.category === "Activewear")) ? "top" : null;
  }
  const sub = (item.subcategory ?? "").toLowerCase();
  if (item.category !== "Tops" || !OPEN_FRONT_TOPS.has(sub)) return null;
  if (outfit.some((o) => o.category === "Dresses" || o.category === "Jumpsuits")) return "dress";
  if (outfit.some((o) => o !== item && (o.category === "Tops" || o.category === "Activewear") && layerRank(o) === 2)) return "top";
  return null;
}
