/** Countries whose public dress norms are more conservative than what most wardrobes assume.
 *
 * Used in two places:
 *  - TripCreate: when a destination is in one of these countries, the person is ASKED whether AURA
 *    should adapt the trip's outfits to local customs (never inferred, never imposed).
 *  - trip-capsule.server.ts: when they said yes, the pieces that don't meet the country's level are
 *    left out of the outfits planned for the days spent there (isItemAllowedByCulture).
 * TripDetail also shows a short note for these destinations.
 *
 * Independent of venue requirements (place-dress-code.ts): a mosque or a church keeps its own,
 * always-respected dress code whatever the answer here.
 *
 * Matching is by WHOLE WORD on the destination label (the destination search returns
 * "City, Region, Country" in English); keywords are in English, Italian, Spanish and French so a
 * hand-typed destination is recognised too. Whole-word on purpose: a plain substring check used to
 * find "oman" inside "Romania" and "fes" inside "festival". City names that also exist elsewhere
 * (Medina, Alexandria, Tripoli) are left out — the country name in the label covers them.
 */

export type CulturalLevel = "conservative" | "strict";

export type CulturalDressNote = {
  /** Display name (English, as the destination search returns it). */
  country: string;
  countryKeywords: string[];
  level: CulturalLevel;
  /** Extra, not checkable from the wardrobe (e.g. a head covering) — shown as advice. */
  advisory?: "head_covering";
};

export const CULTURAL_DRESS_NOTES: CulturalDressNote[] = [
  // strict: legal requirements or very conservative public norms
  { country: "Iran", level: "strict", advisory: "head_covering", countryKeywords: ["iran", "tehran", "teheran", "isfahan", "esfahan", "shiraz", "mashhad"] },
  { country: "Afghanistan", level: "strict", advisory: "head_covering", countryKeywords: ["afghanistan", "afganistan", "kabul"] },
  { country: "Saudi Arabia", level: "strict", countryKeywords: ["saudi arabia", "saudi", "arabia saudita", "arabie saoudite", "riyadh", "riad", "jeddah", "gedda", "mecca", "la mecca", "al-ula", "alula"] },
  { country: "Yemen", level: "strict", countryKeywords: ["yemen", "sanaa", "aden"] },
  { country: "Brunei", level: "strict", countryKeywords: ["brunei", "bandar seri begawan"] },
  { country: "Sudan", level: "strict", countryKeywords: ["sudan", "khartoum", "khartum"] },
  // conservative: covered shoulders and knees expected in public, especially outside resorts
  { country: "United Arab Emirates", level: "conservative", countryKeywords: ["united arab emirates", "uae", "emirati arabi", "emirati arabi uniti", "emiratos arabes unidos", "émirats arabes unis", "dubai", "abu dhabi", "sharjah"] },
  { country: "Qatar", level: "conservative", countryKeywords: ["qatar", "doha"] },
  { country: "Kuwait", level: "conservative", countryKeywords: ["kuwait", "koweït"] },
  { country: "Bahrain", level: "conservative", countryKeywords: ["bahrain", "bahreïn", "manama"] },
  { country: "Oman", level: "conservative", countryKeywords: ["oman", "muscat", "mascate", "salalah"] },
  { country: "Jordan", level: "conservative", countryKeywords: ["jordan", "giordania", "jordania", "jordanie", "amman", "petra", "aqaba", "wadi rum"] },
  { country: "Morocco", level: "conservative", countryKeywords: ["morocco", "marocco", "marruecos", "maroc", "marrakech", "marrakesh", "casablanca", "fes", "fez", "rabat", "tangier", "tangeri", "chefchaouen"] },
  { country: "Egypt", level: "conservative", countryKeywords: ["egypt", "egitto", "egipto", "égypte", "cairo", "il cairo", "le caire", "luxor", "aswan", "assuan", "alessandria d'egitto"] },
  { country: "Iraq", level: "conservative", countryKeywords: ["iraq", "irak", "baghdad", "bagdad", "erbil", "najaf", "karbala"] },
  { country: "Pakistan", level: "conservative", countryKeywords: ["pakistan", "karachi", "lahore", "islamabad"] },
  { country: "Bangladesh", level: "conservative", countryKeywords: ["bangladesh", "dhaka"] },
  { country: "Algeria", level: "conservative", countryKeywords: ["algeria", "argelia", "algérie", "algiers", "algeri", "alger"] },
  { country: "Libya", level: "conservative", countryKeywords: ["libya", "libia", "libye"] },
  { country: "Mauritania", level: "conservative", countryKeywords: ["mauritania", "mauritanie", "nouakchott"] },
  { country: "Somalia", level: "conservative", countryKeywords: ["somalia", "somalie", "mogadishu", "mogadiscio"] },
  { country: "Syria", level: "conservative", countryKeywords: ["syria", "siria", "syrie", "damascus", "damasco", "aleppo"] },
  { country: "Malaysia", level: "conservative", countryKeywords: ["malaysia", "malesia", "malasia", "malaisie", "kuala lumpur", "kelantan", "terengganu"] },
  { country: "Aceh (Indonesia)", level: "conservative", countryKeywords: ["aceh", "banda aceh"] },
  { country: "Maldives", level: "conservative", countryKeywords: ["maldives", "maldive", "maldivas", "malé"] },
  { country: "Vatican City", level: "conservative", countryKeywords: ["vatican city", "vatican", "città del vaticano", "vaticano", "ciudad del vaticano", "cité du vatican"] },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const KEYWORD_RES = CULTURAL_DRESS_NOTES.map((note) => ({
  note,
  res: note.countryKeywords.map((k) => new RegExp(`(^|[^\\p{L}])${escapeRe(k.toLowerCase())}($|[^\\p{L}])`, "u")),
}));

/** The note for one destination label, if any (the strictest match wins). */
export function culturalNoteFor(destinationName: string | null | undefined): CulturalDressNote | null {
  const lower = (destinationName ?? "").toLowerCase();
  if (!lower.trim()) return null;
  const hits = KEYWORD_RES.filter(({ res }) => res.some((re) => re.test(lower))).map(({ note }) => note);
  return hits.find((n) => n.level === "strict") ?? hits[0] ?? null;
}

/** Notes matching any of the given destinations, de-duplicated. */
export function matchCulturalDressNotes(destinationNames: string[]): CulturalDressNote[] {
  const out: CulturalDressNote[] = [];
  for (const name of destinationNames) {
    const n = culturalNoteFor(name);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

type CultureCheckable = {
  category?: string | null;
  subcategory?: string | null;
  length?: string | null;
  sleeveLength?: string | null;
  fit?: string | null;
  styleTags?: string[] | null;
};

const BARE_SHOULDER_OR_MIDRIFF = /off.?shoulder|bardot|halter|strapless|one.?shoulder|cold.?shoulder|bandeau|tube top|backless|cut.?out|crop/i;
const STRAPPY_SUBCATEGORIES = new Set(["Tank Top", "Camisole", "Crop Top", "Vest Top", "Slip Dress"]);
const UPPER_BODY = new Set(["Tops", "Dresses", "Jumpsuits"]);

/** Whether a piece fits the country's level. Unknown attributes never exclude a piece (nothing to
 *  verify against); only what the wardrobe data says is checked.
 *  - conservative: covered shoulders (no sleeveless, strappy, off-shoulder or cropped tops/dresses),
 *    no mini skirts or dresses, no shorts (Bermuda is fine).
 *  - strict: all of the above, plus sleeves at least three-quarter, legs covered to the ankle
 *    (maxi or trousers) and no tight fits. */
export function isItemAllowedByCulture(item: CultureCheckable, level: CulturalLevel): boolean {
  const category = item.category ?? "";
  const sub = item.subcategory ?? "";
  const text = `${sub} ${(item.styleTags ?? []).join(" ")}`;
  if (UPPER_BODY.has(category)) {
    if (item.sleeveLength === "Sleeveless" || STRAPPY_SUBCATEGORIES.has(sub) || BARE_SHOULDER_OR_MIDRIFF.test(text)) return false;
  }
  if (category === "Jumpsuits" && (sub === "Playsuit" || sub === "Romper")) return false;
  const isSkirtOrDress = category === "Dresses" || (category === "Bottoms" && sub === "Skirt");
  if (isSkirtOrDress && item.length === "Mini") return false;
  if (category === "Bottoms" && sub === "Shorts") return false;
  if (level === "strict") {
    if (UPPER_BODY.has(category) && item.sleeveLength === "Short Sleeve") return false;
    if (category === "Bottoms" && sub === "Bermuda Shorts") return false;
    if (isSkirtOrDress && item.length && item.length !== "Maxi" && item.length !== "Long") return false;
    if (item.fit === "Slim" || /bodycon|second.?skin/i.test(text)) return false;
  }
  return true;
}
