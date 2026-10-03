// "Crea outfit partendo da questo": the piece the person picked is the starting point of the outfit,
// never a suggestion. The AI is told so, but the result is also CHECKED: if the piece is missing
// (the model dropped it, or a later clean-up step stripped it), it is put back here, replacing only
// what occupies the same place in the outfit.

/** Which categories a piece of this category replaces in an outfit. */
const REPLACES: Record<string, string[]> = {
  Dresses: ["Dresses", "Jumpsuits", "Tops", "Bottoms"],
  Jumpsuits: ["Dresses", "Jumpsuits", "Tops", "Bottoms"],
  Tops: ["Tops", "Dresses", "Jumpsuits"],
  Bottoms: ["Bottoms", "Dresses", "Jumpsuits"],
  Shoes: ["Shoes"],
  Bags: ["Bags"],
  Outerwear: ["Outerwear"],
};

/** Returns the outfit with the anchor piece guaranteed to be in it (first), dropping only the pieces
 *  it replaces. Unchanged when there is no anchor or it is already there. */
export function ensureAnchor(ids: string[], anchorId: string | null | undefined, categoryOf: (id: string) => string | null | undefined): string[] {
  if (!anchorId) return ids;
  if (ids.includes(anchorId)) return [anchorId, ...ids.filter((id) => id !== anchorId)];
  const replaces = REPLACES[categoryOf(anchorId) ?? ""] ?? [];
  return [anchorId, ...ids.filter((id) => !replaces.includes(categoryOf(id) ?? ""))];
}

/** Error code returned when the anchor piece can't be used (deleted, archived, on loan). The client
 *  shows a clear message instead of silently generating a different outfit. */
export const ANCHOR_UNAVAILABLE = "ANCHOR_UNAVAILABLE";
