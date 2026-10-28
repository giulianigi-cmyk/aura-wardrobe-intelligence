// "Vendi questo capo": which pieces to suggest selling, and the listing to copy into Vinted or
// Vestiaire (title, description, suggested price). Pure, no DB: the Wardrobe screen feeds it the
// pieces it already has and the valuation it already computes for the "Valore" section.
//
// When to suggest a piece — by missed seasons, not by a flat 12 months:
// - a piece for one or two seasons: a whole run of its seasons went by, all of it after the piece
//   was added to the app, without wearing it once (a down jacket left on the hanger all winter);
// - a piece for every season: 6 months without wearing it;
// - an occasion piece (gala, ceremony, formality 5): 2 years — those are worn rarely by nature.
// Never a piece on loan or archived, never underwear, and only for people who actually log what
// they wear (otherwise "never worn" just means "never logged").

export type SellCheckable = {
  id: string;
  category?: string | null;
  season?: string | null;
  occasion?: string | null;
  formality?: number | null;
  last_worn?: string | null;
  created_at?: string | null;
  archived?: boolean | null;
  active_loan_id?: string | null;
};

export type SellReason = "seasonMissed" | "sixMonths" | "twoYears";

const DAY = 86_400_000;
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
type Season = (typeof SEASONS)[number];
const OCCASION_ONLY = /formal|black tie|gala|wedding|cerimonia|ceremony|cocktail/i;

/** Start (inclusive) and end (exclusive) of each season, as in currentSeason(): spring from 20 March,
 *  summer from 21 June, autumn from 22 September, winter from 21 December. */
function seasonWindow(season: Season, year: number): [number, number] {
  switch (season) {
    case "Spring": return [Date.UTC(year, 2, 20), Date.UTC(year, 5, 21)];
    case "Summer": return [Date.UTC(year, 5, 21), Date.UTC(year, 8, 22)];
    case "Autumn": return [Date.UTC(year, 8, 22), Date.UTC(year, 11, 21)];
    case "Winter": return [Date.UTC(year, 11, 21), Date.UTC(year + 1, 2, 20)];
  }
}

/** The most recent run of `season` that has fully ended before `now`. */
function lastCompleted(season: Season, now: number): [number, number] {
  const y = new Date(now).getUTCFullYear();
  for (let year = y; year >= y - 2; year--) {
    const w = seasonWindow(season, year);
    if (w[1] <= now) return w;
  }
  return seasonWindow(season, y - 3);
}

function seasonsOf(season: string | null | undefined): Season[] {
  const tags = (season ?? "").split(",").map((s) => s.trim());
  if (tags.some((s) => /all/i.test(s))) return [];
  return SEASONS.filter((s) => tags.some((t) => t.toLowerCase() === s.toLowerCase() || (s === "Autumn" && /fall/i.test(t))));
}

/** People who log what they wear: at least 5 pieces worn in the last 60 days. */
export function logsWear(items: readonly SellCheckable[], now = Date.now()): boolean {
  return items.filter((it) => it.last_worn && now - Date.parse(it.last_worn) <= 60 * DAY).length >= 5;
}

/** Why `item` is worth selling now, or null. */
export function sellReason(item: SellCheckable, now = Date.now()): SellReason | null {
  if (item.archived || item.active_loan_id || item.category === "Underwear") return null;
  const added = item.created_at ? Date.parse(item.created_at) : NaN;
  if (!Number.isFinite(added)) return null;
  const lastWorn = item.last_worn ? Date.parse(item.last_worn) : null;
  const since = Math.max(added, lastWorn ?? 0);

  const tags = (item.occasion ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const occasionPiece = (item.formality ?? 0) >= 5 || (tags.length > 0 && tags.every((t) => OCCASION_ONLY.test(t)));
  if (occasionPiece) return now - since >= 730 * DAY ? "twoYears" : null;

  const seasons = seasonsOf(item.season);
  if (seasons.length >= 1 && seasons.length <= 2) {
    const runs = seasons.map((s) => lastCompleted(s, now));
    const start = Math.min(...runs.map((r) => r[0]));
    // The whole run must have happened while the piece was in the app, and with no wear since it began.
    if (added <= start && (lastWorn == null || lastWorn < start)) return "seasonMissed";
    return null;
  }
  return now - since >= 182 * DAY ? "sixMonths" : null;
}

/** Vinted's conditions, best first. */
export const SELL_CONDITIONS = ["newWithTags", "newNoTags", "veryGood", "good", "fair"] as const;
export type SellCondition = (typeof SELL_CONDITIONS)[number];

/** Suggested asking price from the resale range of the "Valore" section: the top of the range for a
 *  piece new with tags, down to below the bottom for one in fair condition. Rounded to whole euros
 *  (to 5 above 100). Null without a valuation. */
export function suggestedPrice(low: number | null | undefined, high: number | null | undefined, condition: SellCondition): number | null {
  if (low == null || high == null || !(high > 0)) return null;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const at: Record<SellCondition, number> = { newWithTags: hi, newNoTags: lo + (hi - lo) * 0.75, veryGood: (lo + hi) / 2, good: lo + (hi - lo) * 0.25, fair: lo * 0.85 };
  const p = at[condition];
  return p >= 100 ? Math.round(p / 5) * 5 : Math.max(1, Math.round(p));
}

export type ListingText = {
  conditionLabels: Record<SellCondition, string>;
  size: string; materials: string; color: string; condition: string; brand: string;
};

/** Title (at most 60 characters, the Vinted limit) and description, in the person's language. */
export function buildListing(
  input: { brand?: string | null; garment: string; colorLabel?: string | null; size?: string | null; materials: string[]; condition: SellCondition },
  text: ListingText,
): { title: string; description: string } {
  const sizePart = input.size ? ` · ${text.size} ${input.size}` : "";
  let title = `${input.brand ? `${input.brand} ` : ""}${input.garment}${sizePart}`.replace(/\s+/g, " ").trim();
  if (title.length > 60) title = `${title.slice(0, 59).trimEnd()}…`;
  const lines = [
    `${input.brand ? `${input.brand} – ` : ""}${input.garment}`,
    "",
    input.brand ? `${text.brand}: ${input.brand}` : null,
    input.size ? `${text.size}: ${input.size}` : null,
    input.colorLabel ? `${text.color}: ${input.colorLabel}` : null,
    input.materials.length ? `${text.materials}: ${input.materials.join(", ")}` : null,
    `${text.condition}: ${text.conditionLabels[input.condition]}`,
  ].filter((l): l is string => l !== null);
  return { title, description: lines.join("\n") };
}
