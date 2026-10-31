// A floor-length piece — a maxi dress or skirt, a full-length jumpsuit — takes a long coat or a short
// jacket, never a coat that stops halfway down the leg: the hem of the dress shows under it for a
// few centimetres and the proportions break (reported: a cream knee-length coat over a black
// velvet wide-leg jumpsuit, with a long black coat in the same wardrobe). Blazers and vests are
// worn open over anything and are not counted. One rule, used by every engine that composes an
// outfit.

export type LengthCheckable = {
  category?: string | null;
  subcategory?: string | null;
  length?: string | null;
};

const SKIRT = /skirt|gonna|falda|jupe/i;
const SHORT_JUMPSUIT = /playsuit|romper|short/i;
const NOT_A_COAT = /blazer|vest|gilet/i;

/** A piece that reaches the ankles: a Maxi dress or skirt, or a jumpsuit (not a playsuit). */
export function isFloorLength(it: LengthCheckable): boolean {
  if (it.category === "Dresses" || (it.category === "Bottoms" && SKIRT.test(it.subcategory ?? ""))) return it.length === "Maxi";
  if (it.category === "Jumpsuits") return !SHORT_JUMPSUIT.test(it.subcategory ?? "");
  return false;
}

/** A coat or jacket stored as "Mid" length (blazers and vests aside). */
export function isMidLengthCoat(it: LengthCheckable): boolean {
  return it.category === "Outerwear" && it.length === "Mid" && !NOT_A_COAT.test(it.subcategory ?? "");
}

/** True when the look puts a mid-length coat over a floor-length piece. */
export function midCoatOverFloorLength(items: readonly LengthCheckable[]): boolean {
  return items.some(isFloorLength) && items.some(isMidLengthCoat);
}

export const COAT_LENGTH_PROMPT_RULE =
  "COAT LENGTH RULE — HARD EXCLUSION: with a floor-length piece (a dress or skirt of length Maxi, or a Jumpsuit that is not a playsuit/romper) the outerwear must be a Long coat or a Short jacket (or a blazer), never a coat or jacket of length Mid: " +
  "its hem would stop halfway down the long piece. If the wardrobe has a Long coat, prefer it, in a colour that suits the look (a black long coat over a black evening jumpsuit).";
