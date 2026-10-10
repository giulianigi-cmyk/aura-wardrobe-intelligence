// "Al tuo guardaroba manca: borsa a tracolla nera" — while a black Saint Laurent bag worn both on the
// shoulder and crossbody was in the wardrobe. The old check needed the SAME subcategory and the SAME
// colour name: pieces with no subcategory on file were ignored, "Shoulder Bag" never covered
// "Crossbody", and "Black" never matched "Jet Black". This decides, more like a person would,
// whether a suggested piece is already owned.
import { colorNameSimilarity } from "./outfit-match";

export type OwnedLike = {
  id?: string; category?: string | null; subcategory?: string | null; colors?: string[] | null;
  model?: string | null; brand?: string | null; details?: string[] | null;
  material?: string[] | null; season?: string | null;
};

/** Owned subcategories that already do the job of the suggested one. */
const COVERED_BY: Record<string, string[]> = {
  // most shoulder bags have an adjustable / removable strap and are worn crossbody too
  Crossbody: ["Crossbody", "Shoulder Bag", "Hobo Bag", "Satchel", "Bucket Bag"],
  "Shoulder Bag": ["Shoulder Bag", "Crossbody", "Hobo Bag"],
  "Hobo Bag": ["Hobo Bag", "Shoulder Bag"],
  Boots: ["Boots", "Knee Boots", "Over-the-Knee Boots", "Chelsea Boots", "Combat Boots"],
  "Ankle Boots": ["Ankle Boots", "Chelsea Boots"],
  Flats: ["Flats"],
  Sweater: ["Sweater", "Knit Top"],
  "Knit Top": ["Knit Top", "Sweater"],
  Trousers: ["Trousers"],
};

// A top-handle bag sold "with shoulder strap" (Speedy Bandoulière, convertible) is also crossbody.
const STRAP_WORDS = /bandouli|strap|tracolla|convertible|crossbody|cross-body|shoulder/i;

// Knitwear fibres: a wool or cashmere dress IS a knit dress ("abito in maglia"), whatever type is on file.
const KNIT_FIBRES = /wool|lana|merino|cashmere|mohair|alpaca|knit|maglia/i;
const KNIT_TYPES: Record<string, string> = { "Sweater Dress": "Dresses" };

function subcategoryCovers(suggested: string, owned: OwnedLike): boolean {
  const sub = owned.subcategory ?? "";
  if (!sub) return true; // type not on file: it may well be this piece — never suggest it as missing
  if (sub === suggested) return true;
  if (KNIT_TYPES[suggested] && owned.category === KNIT_TYPES[suggested]
    && KNIT_FIBRES.test(`${(owned.material ?? []).join(" ")} ${(owned.details ?? []).join(" ")}`)) return true;
  if ((COVERED_BY[suggested] ?? []).includes(sub)) return true;
  if ((suggested === "Crossbody" || suggested === "Shoulder Bag") && STRAP_WORDS.test(`${owned.model ?? ""}`)) return true;
  // how the bag can actually be carried, from the photo analysis (garment-details.ts)
  const carry = owned.details ?? [];
  if (suggested === "Crossbody" && carry.includes("crossbody")) return true;
  if (suggested === "Shoulder Bag" && carry.includes("shoulder")) return true;
  return false;
}

// Black and the darkest greys read as one colour in a wardrobe: a charcoal dress covers "black or dark grey".
const DARK_NEUTRALS = new Set(["Black", "Jet Black", "Soft Black", "Charcoal", "Graphite", "Anthracite"]);

function sameColour(suggested: string[], owned: string[]): boolean {
  if (!suggested.length || !owned.length) return false;
  return suggested.some((a) => owned.some((b) =>
    a === b || (DARK_NEUTRALS.has(a) && DARK_NEUTRALS.has(b)) || (colorNameSimilarity(a, b) ?? 0) >= 0.7));
}

/** Wearable in that season: "All Seasons", that season, or no season on file (unknown: assume yes). */
function wearableIn(owned: OwnedLike, season: string | undefined): boolean {
  if (!season) return true;
  const s = (owned.season ?? "").toLowerCase();
  return !s || s.includes("all") || s.includes(season.toLowerCase());
}

/** The owned piece that already covers the suggestion (same category, a type that does the same
 *  job or no type on file, a colour close enough to read as the same), or null. */
export function ownedEquivalent<T extends OwnedLike>(
  suggestion: { category: string; subcategory: string; colors: string[] },
  wardrobe: T[],
  opts: { season?: string } = {},
): T | null {
  // With a season, only pieces wearable in it count: a black summer dress does not cover a black
  // dress for winter.
  return wardrobe.find((it) =>
    it.category === suggestion.category &&
    subcategoryCovers(suggestion.subcategory, it) &&
    sameColour(suggestion.colors, it.colors ?? []) &&
    wearableIn(it, opts.season),
  ) ?? null;
}
