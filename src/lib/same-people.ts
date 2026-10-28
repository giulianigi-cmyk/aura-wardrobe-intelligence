// «Già indossato con queste persone». Pure, no DB.
//
// An event that repeats in the calendar — the Monday meeting, Thursday's dinner, the same class — is
// almost always with the same people. Its occurrences share a title once dates and numbers are taken
// out («Riunione 14/10», «Riunione #3» → «riunione»). When an outfit is planned for one of them, the
// looks of its earlier occurrences in the last weeks say what those people have already seen.
//
// What counts as "the same look": the same main piece — the top, the dress or jumpsuit, the jacket or
// coat. Jeans, shoes and bags worn again are normal and are not pointed out.

export const SAME_PEOPLE_WEEKS = 6;
export const MAIN_PIECE_CATEGORIES: ReadonlySet<string> = new Set(["Tops", "Dresses", "Jumpsuits", "Outerwear"]);

/** The title of a repeating event without dates, times, numbers and punctuation; null when what is
 *  left is too short to identify anything. */
export function seriesKey(title: string | null | undefined): string | null {
  const key = (title ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\d+([:./-]\d+)*/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length >= 3 ? key : null;
}

/** The outfit of one occurrence of a calendar event. */
export type EventLook = { eventId: string; date: string; title: string | null; itemIds: string[] };

const DAY = 86_400_000;
const dayOf = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** The looks of the same event's earlier occurrences in the last weeks, most recent first. */
export function earlierSameSeries(
  target: { eventId: string; title: string | null; date: string },
  looks: readonly EventLook[],
  weeks = SAME_PEOPLE_WEEKS,
): EventLook[] {
  const key = seriesKey(target.title);
  if (!key) return [];
  const until = dayOf(target.date);
  const from = until - weeks * 7 * DAY;
  return looks
    .filter((l) => l.eventId !== target.eventId && l.itemIds.length > 0 && seriesKey(l.title) === key)
    .filter((l) => { const d = dayOf(l.date); return d < until && d >= from; })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The main pieces of `selected` already worn at an earlier occurrence, each with the most recent one. */
export function repeatedMainPieces(
  selected: readonly string[],
  earlier: readonly EventLook[],
  categoryOf: (id: string) => string | null | undefined,
): { itemId: string; look: EventLook }[] {
  const out: { itemId: string; look: EventLook }[] = [];
  for (const id of selected) {
    if (!MAIN_PIECE_CATEGORIES.has(categoryOf(id) ?? "")) continue;
    const look = earlier.find((l) => l.itemIds.includes(id));
    if (look) out.push({ itemId: id, look });
  }
  return out;
}

/** The earlier occurrence with exactly the same pieces, if any. */
export function sameLookAs(selected: readonly string[], earlier: readonly EventLook[]): EventLook | null {
  const set = new Set(selected);
  if (!set.size) return null;
  return earlier.find((l) => l.itemIds.length === set.size && l.itemIds.every((id) => set.has(id))) ?? null;
}

/** Main pieces those people have already seen: to avoid when an outfit is generated for the event. */
export function seenMainPieces(earlier: readonly EventLook[], categoryOf: (id: string) => string | null | undefined): string[] {
  return [...new Set(earlier.flatMap((l) => l.itemIds).filter((id) => MAIN_PIECE_CATEGORIES.has(categoryOf(id) ?? "")))];
}
