// Shared activity-kind detection — extracted from trip-capsule.server.ts,
// where this used to live as a private, trip-only concept. Concert
// detection (with its hard exclusions and temperature-graduated scoring)
// only ever worked inside a planned trip; asking "what should I wear to
// a concert tonight" anywhere else in AURA got no special handling at
// all. This module is the fix: one detector, importable by Trip Capsule
// AND the general engines (ai-suggest-outfit.functions.ts,
// suggest-daily-looks.functions.ts), so the same activity is recognized
// the same way everywhere.
//
// Deliberately decoupled from any one caller's dress-code vocabulary:
// callers pass their own computed `minFormality` (the top of whatever
// formality range their own dress-code table maps to) rather than this
// module owning a copy of that table — trip-capsule.server.ts and the
// general engine don't necessarily use identical dress-code strings.

export type ActivityKind = "swim" | "sport" | "concert" | "elegant_dinner" | "business_dinner" | null;

export type ActivityContext = {
  label: string | null;
  dressCode: string | null;
  /** Top of the formality range this dress code maps to, in whatever
   *  1-5 scale the caller already uses (see the Outfit Engine doc's
   *  formality table). Optional — omit if the caller has no such
   *  mapping; keyword matching alone still works. */
  minFormality?: number | null;
};

const SWIM_KEYWORDS = ["pool", "piscina", "swim", "nuot", "beach", "spiagg", "mare", "sea", "snorkel", "lido", "water park", "acquapark"];
const SPORT_KEYWORDS = ["yoga", "gym", "palestra", "run", "corsa", "hike", "trek", "workout", "fitness", "pilates", "bike", "cycl", "tennis", "padel", "climb"];

const CONCERT_KEYWORDS = [
  // Italiano
  "concerto", "concerti", "festival", "rave", "discoteca", "dj ",
  // English — "live" and "show" alone are too generic ("live meeting",
  // "trade show"), so only their unambiguous compound forms appear here.
  "concert", "dj set", "djset", "dj-set", "live music", "live show", "gig", "after party", "afterparty", "club night",
  // Español
  "concierto", "conciertos",
  // Français
  "concert de", "boîte de nuit",
  // Deutsch
  "konzert", "musikfestival",
  // Luoghi ed etichette che compaiono nei titoli reali di calendario
  "arena", "stadio", "stadium", "forum", "san siro", "olimpico", "coachella", "tomorrowland", "primavera sound", "lollapalooza", "glastonbury",
];

// Checked BEFORE the generic dinner/elegance keywords below — a business
// dinner is still, lexically, a dinner ("cena di lavoro" contains
// "cena"), so it must win the match first or every business dinner would
// be read as an ordinary elegant one.
const BUSINESS_DINNER_KEYWORDS = [
  "cena di lavoro", "cena aziendale", "cena con clienti", "cena con i clienti",
  "pranzo di lavoro", "pranzo aziendale",
  "business dinner", "business lunch", "client dinner", "working dinner", "team dinner",
  "dîner d'affaires", "dîner professionnel",
  "geschäftsessen", "arbeitsessen",
  "cena de negocios", "cena de trabajo",
];

const DINNER_KEYWORDS = ["dinner", "cena", "diner", "abendessen"];

/** Broader than DINNER_KEYWORDS — anything that signals "this calls for
 *  an elegant piece" even without the word "dinner" itself (a gala, a
 *  wedding, a black-tie event). Also feeds hasEleganceSignal() below,
 *  which trip-capsule.server.ts already used before this module existed
 *  (kept here verbatim so its behavior doesn't change). */
const ELEGANT_KEYWORDS = ["dinner", "cena", "restaurant", "ristorante", "gala", "wedding", "matrimonio", "cocktail", "resort", "exclusive", "esclusiv", "fine dining", "black tie"];

export function detectActivityKind(ctx: ActivityContext): ActivityKind {
  const text = `${ctx.label ?? ""}`.toLowerCase();
  if (SWIM_KEYWORDS.some((k) => text.includes(k))) return "swim";
  if (SPORT_KEYWORDS.some((k) => text.includes(k)) || ctx.dressCode === "Sport") return "sport";
  // Checked after swim/sport (a "beach festival" is still a beach day
  // first) but before dinners — this is what stops a concert being read
  // as an ordinary evening.
  if (CONCERT_KEYWORDS.some((k) => text.includes(k))) return "concert";
  if (BUSINESS_DINNER_KEYWORDS.some((k) => text.includes(k))) return "business_dinner";
  if (DINNER_KEYWORDS.some((k) => text.includes(k)) || hasEleganceSignal(ctx)) return "elegant_dinner";
  return null;
}

/** True only when this specific context gives a genuine reason to need
 *  an elegant piece — a high enough formality range, or the activity's
 *  own wording (a resort dinner, a wedding). Owning a heel doesn't
 *  create the need; a requirement like this does. */
export function hasEleganceSignal(ctx: ActivityContext): boolean {
  if ((ctx.minFormality ?? 0) >= 4) return true;
  const text = `${ctx.label ?? ""} ${ctx.dressCode ?? ""}`.toLowerCase();
  return ELEGANT_KEYWORDS.some((k) => text.includes(k));
}

// Business-dinner soft guidance: colors read as understated/professional
// rather than statement pieces. A short, non-exhaustive list on purpose —
// this nudges scoring, it never excludes a color outright (no color rule
// in AURA is a hard exclusion; see the Outfit Engine doc's color section).
const CONSERVATIVE_COLORS = ["black", "navy", "grey", "gray", "charcoal", "white", "cream", "camel", "beige", "burgundy"];

/** Soft scoring nudge for a business dinner: prefers understated colors
 *  and penalizes a very short hemline. Deliberately narrow — AURA's
 *  wardrobe schema has no neckline field to check "no plunging
 *  necklines" against, so this only acts on the two attributes that
 *  actually exist (length, color) rather than pretending to cover more
 *  than the data supports. Returns a small bonus/penalty, not a hard
 *  exclusion — the same "nudge, don't forbid" principle as
 *  styleMemoryBonus in trip-capsule.server.ts. */
export function businessDinnerAdjustment(item: { length?: string | null; colors?: string[] | null }): number {
  let score = 0;
  if (item.length && /mini|micro/i.test(item.length)) score -= 3;
  if (item.colors?.some((c) => CONSERVATIVE_COLORS.some((cc) => c.toLowerCase().includes(cc)))) score += 1.5;
  return score;
}
