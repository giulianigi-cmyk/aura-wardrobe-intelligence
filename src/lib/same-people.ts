// «Già indossato con queste persone». Pure, no DB.
//
// An event that repeats in the calendar — the Monday meeting, Thursday's dinner, the same class — is
// almost always with the same people. Its occurrences share a title once dates and numbers are taken
// out («Riunione 14/10», «Riunione #3» → «riunione»). When an outfit is planned for one of them, the
// looks of its earlier occurrences in the last weeks say what those people have already seen.
//
// The same place counts too, for a social occasion — a dinner, a lunch, a brunch, an aperitivo, an evening
// out, a party: not nice to be seen at the same restaurant in the same things. Not for the office or
// work, where the same place comes up nearly every day.
//
// What counts as "the same look": the same main piece — the top, the dress or jumpsuit, the jacket or
// coat. Jeans, shoes and bags worn again are normal and are not pointed out.

export const SAME_PEOPLE_WEEKS = 6;
export const SAME_PLACE_WEEKS = 6;

const SOCIAL_OCCASION = /\b(cena|pranzo|brunch|aperitiv\w*|apericena|serata|festa|party|compleanno|matrimonio|cerimonia|dinner|lunch|drinks?|evening|night out|birthday|wedding|d[iî]ner|d[ée]jeuner|soir[ée]e|f[eê]te|anniversaire|mariage|almuerzo|comida|copas|fiesta|cumplea[nñ]os|boda)\b|晚餐|午餐|早午餐|聚会|派对|生日|婚礼/i;

/** A dinner, lunch, brunch, aperitivo, evening out, party, birthday or wedding, from its title. */
export function isSocialOccasion(title: string | null | undefined): boolean {
  return SOCIAL_OCCASION.test((title ?? "").normalize("NFC"));
}
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

/** The place of an event without punctuation and case; null when empty or too short. */
export function placeKey(location: string | null | undefined): string | null {
  const key = (location ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length >= 4 ? key : null;
}

/** The outfit of one occurrence of a calendar event. */
export type EventLook = { eventId: string; date: string; title: string | null; location?: string | null; itemIds: string[] };

const DAY = 86_400_000;
const dayOf = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** The looks of earlier events with the same people or in the same place, most recent first: the
 *  same repeating event, or — when this one is a social occasion — an event at the same place, both
 *  over the last 6 weeks. */
export function earlierSameSeries(
  target: { eventId: string; title: string | null; location?: string | null; date: string },
  looks: readonly EventLook[],
): (EventLook & { match: "event" | "place" })[] {
  const key = seriesKey(target.title);
  const place = isSocialOccasion(target.title) ? placeKey(target.location) : null;
  if (!key && !place) return [];
  const until = dayOf(target.date);
  const out: (EventLook & { match: "event" | "place" })[] = [];
  for (const l of looks) {
    if (l.eventId === target.eventId || !l.itemIds.length) continue;
    const d = dayOf(l.date);
    if (d >= until) continue;
    if (key && seriesKey(l.title) === key && d >= until - SAME_PEOPLE_WEEKS * 7 * DAY) out.push({ ...l, match: "event" });
    else if (place && placeKey(l.location) === place && d >= until - SAME_PLACE_WEEKS * 7 * DAY) out.push({ ...l, match: "place" });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** The main pieces of `selected` already worn at an earlier occurrence, each with the most recent one. */
export function repeatedMainPieces<L extends EventLook>(
  selected: readonly string[],
  earlier: readonly L[],
  categoryOf: (id: string) => string | null | undefined,
): { itemId: string; look: L }[] {
  const out: { itemId: string; look: L }[] = [];
  for (const id of selected) {
    if (!MAIN_PIECE_CATEGORIES.has(categoryOf(id) ?? "")) continue;
    const look = earlier.find((l) => l.itemIds.includes(id));
    if (look) out.push({ itemId: id, look });
  }
  return out;
}

/** The earlier occurrence with exactly the same pieces, if any. */
export function sameLookAs<L extends EventLook>(selected: readonly string[], earlier: readonly L[]): L | null {
  const set = new Set(selected);
  if (!set.size) return null;
  return earlier.find((l) => l.itemIds.length === set.size && l.itemIds.every((id) => set.has(id))) ?? null;
}

/** Main pieces those people have already seen: to avoid when an outfit is generated for the event. */
export function seenMainPieces(earlier: readonly EventLook[], categoryOf: (id: string) => string | null | undefined): string[] {
  return [...new Set(earlier.flatMap((l) => l.itemIds).filter((id) => MAIN_PIECE_CATEGORIES.has(categoryOf(id) ?? "")))];
}
