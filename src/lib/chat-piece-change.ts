// "Forse meglio una borsa più piccola?" — a request to change ONE piece of the outfit just proposed.
// The model used to answer with a whole new outfit (dress, shoes and bag all different). This
// detects such requests and makes sure, in code, that every other piece of the previous outfit
// stays exactly the same.
import { mentionedCategories, normalizeText } from "./wardrobe-search";
import { REPLACES } from "./outfit-anchor";

// Words that ask to change / adjust a piece, in it/en/es/fr.
const CHANGE_WORDS = /\b(piu piccol\w*|piu grand\w*|piu lung\w*|piu cort\w*|piu elegant\w*|piu casual|piu sportiv\w*|meno \w+|un altr[ao]|altr[ao]|cambia\w*|sostitui\w*|divers[ao]|invece|meglio|smaller|bigger|larger|longer|shorter|another|different|change|swap|replace|instead|other|mas pequen\w*|mas grand\w*|otr[ao]|cambi\w*|plus petit\w*|plus grand\w*|autre|changer|remplac\w*)\b/;
// Asking for a whole new look is not a one-piece change.
const WHOLE_LOOK = /\b(outfit|look|tutto|tutta|everything|todo|tout|da capo|from scratch)\b/;

export type PieceChange = {
  /** Categories the person wants changed (with what a dress/top/bottom stands in for). */
  targetCategories: string[];
  /** Pieces of the previous outfit that must stay. */
  keepIds: string[];
};

export function detectPieceChange(
  message: string,
  previousIds: string[] | null | undefined,
  categoryOf: (id: string) => string | null | undefined,
): PieceChange | null {
  if (!previousIds?.length) return null;
  const text = normalizeText(message);
  if (!CHANGE_WORDS.test(text) || WHOLE_LOOK.test(text)) return null;
  const named = mentionedCategories(message);
  if (!named.length) return null;
  const target = new Set<string>();
  const CORE = ["Dresses", "Jumpsuits", "Tops", "Bottoms"];
  const prevHasOnePiece = previousIds.some((id) => ["Dresses", "Jumpsuits"].includes(categoryOf(id) ?? ""));
  for (const c of named) {
    if (CORE.includes(c) && (prevHasOnePiece || c === "Dresses" || c === "Jumpsuits")) {
      // A dress swapped for a skirt needs a top too (and the other way round): the whole core
      // of the look may change, accessories, shoes and bag stay.
      CORE.forEach((x) => target.add(x));
    } else if (CORE.includes(c)) {
      target.add(c); // top + bottom outfit: "un'altra gonna" keeps the top
    } else {
      (REPLACES[c] ?? [c]).forEach((x) => target.add(x));
    }
  }
  // Only meaningful when the previous outfit has a piece of that kind to change.
  if (!previousIds.some((id) => target.has(categoryOf(id) ?? ""))) return null;
  return {
    targetCategories: [...target],
    keepIds: previousIds.filter((id) => !target.has(categoryOf(id) ?? "")),
  };
}

/** The outfit after a one-piece change: every kept piece, plus the new piece(s) the model chose
 *  for the target categories; if it chose none, the previous ones stay (nothing silently lost). */
export function applyPieceChange(
  newIds: string[],
  change: PieceChange,
  previousIds: string[],
  categoryOf: (id: string) => string | null | undefined,
): string[] {
  const target = new Set(change.targetCategories);
  const replacements = newIds.filter((id) => target.has(categoryOf(id) ?? "") && !change.keepIds.includes(id));
  const fresh = replacements.filter((id) => !previousIds.includes(id));
  const chosen = fresh.length ? fresh : replacements.length ? replacements : previousIds.filter((id) => target.has(categoryOf(id) ?? ""));
  return [...change.keepIds, ...chosen].slice(0, 6);
}
