// Suits: a blazer and the trousers (or skirt) cut from the same cloth are worn together, and one
// suit's jacket is never paired with another suit's trousers (a black jacket over burgundy suit
// trousers reads as a mistake, not a choice). The wardrobe has no "suit" field, so the two halves are
// recognised the way a person would: same brand and same colour, a tailored jacket and tailored
// bottoms. Used by the outfit engine (ai-suggest-outfit.functions.ts) after the model has answered.

export type SuitCheckable = {
  id: string;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  colors?: string[] | null;
};

const JACKET = /blazer|suit|giacca|tailleur|americana|veste/i;
const TAILORED_BOTTOM = /trouser|pant|pantalon|skirt|gonna|falda|jupe/i;
const NOT_TAILORED = /jean|legging|jogger|cargo|short|bermuda|sweat/i;

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function isSuitJacket(it: SuitCheckable): boolean {
  return it.category === "Outerwear" && JACKET.test(it.subcategory ?? "");
}

export function isSuitBottom(it: SuitCheckable): boolean {
  const sub = it.subcategory ?? "";
  return it.category === "Bottoms" && TAILORED_BOTTOM.test(sub) && !NOT_TAILORED.test(sub);
}

/** Two halves of the same suit: a tailored jacket and tailored bottoms, same brand, same colour. */
export function isSuitPair(a: SuitCheckable, b: SuitCheckable): boolean {
  const [jacket, bottom] = isSuitJacket(a) ? [a, b] : [b, a];
  if (!isSuitJacket(jacket) || !isSuitBottom(bottom)) return false;
  const brand = norm(jacket.brand);
  const color = norm(jacket.colors?.[0]);
  return !!brand && !!color && brand === norm(bottom.brand) && color === norm(bottom.colors?.[0]);
}

/**
 * Keeps a look's suit halves together. When the look has a suit jacket and bottoms that belong to a
 * DIFFERENT suit, the bottoms are swapped for the jacket's own (or, if those are not available, the
 * jacket for the bottoms' own); with neither available, for bottoms that belong to no suit. A jacket worn with
 * ordinary trousers, jeans or a skirt that belongs to no suit is never touched.
 */
export function keepSuitsTogether<T extends SuitCheckable>(ids: string[], available: T[], canUse: (it: T) => boolean = () => true): string[] {
  const byId = new Map(available.map((it) => [it.id, it] as const));
  const jacket = ids.map((id) => byId.get(id)).find((it): it is T => !!it && isSuitJacket(it));
  const bottom = ids.map((id) => byId.get(id)).find((it): it is T => !!it && isSuitBottom(it));
  if (!jacket || !bottom || isSuitPair(jacket, bottom)) return ids;
  const bottomsOwnJacket = available.find((it) => it.id !== jacket.id && isSuitPair(it, bottom));
  if (!bottomsOwnJacket) return ids; // the bottoms belong to no suit: an ordinary pairing
  const jacketsOwnBottom = available.find((it) => it.id !== bottom.id && isSuitPair(jacket, it) && canUse(it));
  if (jacketsOwnBottom) return ids.map((id) => (id === bottom.id ? jacketsOwnBottom.id : id));
  if (canUse(bottomsOwnJacket)) return ids.map((id) => (id === jacket.id ? bottomsOwnJacket.id : id));
  // Neither half's partner can be used: the bottoms are swapped for ones that belong to no suit
  // (tailored ones first), so two suits are never mixed.
  const standalone = available
    .filter((it) => it.category === "Bottoms" && !ids.includes(it.id) && canUse(it) && !available.some((j) => isSuitPair(j, it)))
    .sort((a, b) => Number(isSuitBottom(b)) - Number(isSuitBottom(a)))[0];
  return standalone ? ids.map((id) => (id === bottom.id ? standalone.id : id)) : ids;
}
