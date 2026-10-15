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
 * Keeps a look's suit halves together, and wears a suit as a suit whenever possible:
 *  1. a suit jacket whose own bottoms can be used is worn with them, not with other tailored trousers
 *     or a skirt (with jeans it is a deliberate casual pairing and stays);
 *  2. suit bottoms whose own jacket can be used, under another blazer, get their own jacket;
 *  3. otherwise two suits are never mixed: the bottoms of a different suit are swapped for ones that
 *     belong to no suit.
 * Pieces in `locked` (the person's own starting piece) are never swapped out.
 */
export function keepSuitsTogether<T extends SuitCheckable>(ids: string[], available: T[], canUse: (it: T) => boolean = () => true, locked: ReadonlySet<string> = new Set()): string[] {
  const byId = new Map(available.map((it) => [it.id, it] as const));
  const jacket = ids.map((id) => byId.get(id)).find((it): it is T => !!it && isSuitJacket(it));
  // Only tailored bottoms: a suit jacket worn with jeans is a deliberate, casual choice and stays.
  const bottom = ids.map((id) => byId.get(id)).find((it): it is T => !!it && isSuitBottom(it));
  if (!jacket || !bottom || isSuitPair(jacket, bottom)) return ids;
  const swap = (from: string, to: string) => ids.map((id) => (id === from ? to : id));
  // 1. the jacket's own bottoms
  const jacketsOwnBottom = available.find((it) => it.id !== bottom.id && isSuitPair(jacket, it) && canUse(it));
  if (jacketsOwnBottom && !locked.has(bottom.id)) return swap(bottom.id, jacketsOwnBottom.id);
  // 2. the bottoms' own jacket
  const bottomsOwnJacket = available.find((it) => it.id !== jacket.id && isSuitPair(it, bottom));
  if (bottomsOwnJacket && canUse(bottomsOwnJacket) && !locked.has(jacket.id)) return swap(jacket.id, bottomsOwnJacket.id);
  // 3. two different suits, neither partner usable: bottoms that belong to no suit
  if (!bottomsOwnJacket || locked.has(bottom.id)) return ids;
  const standalone = available
    .filter((it) => it.category === "Bottoms" && !ids.includes(it.id) && canUse(it) && !available.some((j) => isSuitPair(j, it)))
    .sort((a, b) => Number(isSuitBottom(b)) - Number(isSuitBottom(a)))[0];
  return standalone ? swap(bottom.id, standalone.id) : ids;
}
