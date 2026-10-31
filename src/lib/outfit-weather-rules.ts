// AURA — Universal weather/season hard-check for outfit generation.
//
// Prima di questo file, la stessa identica regola viveva in due posti
// diversi: dentro suggestOutfitCore (ai-suggest-outfit.functions.ts) e come
// copia indipendente in suggest-daily-looks.functions.ts. Le due copie
// erano divergenti — quella di Home non controllava il campo `material`,
// usava `season === "winter"` invece di `.includes()` (season è una
// stringa multi-valore tipo "Autumn, Winter", quindi l'uguaglianza stretta
// non matcha quasi mai un capo invernale vero), e aveva una regex più
// corta (mancavano wool/lana/cashmere/tweed/ecc.). Risultato pratico: un
// maglione di lana poteva superare il controllo di Home mentre veniva
// correttamente escluso ovunque altro. Questo file è ora l'unica fonte di
// verità — nessun motore deve più avere una propria copia.
//
// weekly-outfits.functions.ts e trip-capsule.server.ts ereditano già
// questa regola indirettamente, perché entrambi chiamano suggestOutfitCore
// per la generazione finale.

import { isSummerSeason } from "./outfit-styling-rules";
import { temperatureAt } from "./commute-weather";

export const HOT_THRESHOLD_C = 26;
export const COLD_THRESHOLD_C = 10;

// A real coat (wool coat, parka, puffer, shearling) or a wool jacket only at COLD_THRESHOLD_C or
// below: above it a trench, a light jacket or a blazer is enough (reported: a coat proposed for a mild day "is too much,
// coats are from 10 degrees down"). Trench and rain coats are mid-season pieces and stay allowed.
const HEAVY_COAT_TYPE = /^(coat|parka|puffer jacket)$/i;
const HEAVY_COAT_TEXT = /piumino|shearling|montone|overcoat|cappotto|down coat/i;
const MID_SEASON_COAT = /trench|rain|impermeabile/i;

const WOOL = /wool|lana|cashmere|cachemire|tweed|bouclé|boucle|loden/i;
const TAILORED = /blazer|vest|gilet/i;

// From COLD_THRESHOLD_C to MID_SEASON_MAX_C (10–17 °C) the right outer layer is a leather jacket, a
// lightly padded jacket or a light / sleeveless puffer (reported: "tra 10 e 17 anche giacche di
// pelle o leggermente imbottite, piumini leggeri smanicati"). Above 17 °C nothing padded.
export const MID_SEASON_MAX_C = 17;
const PADDED = /puffer|padded|quilted|imbottit|trapuntat|piumin|down\b/i;
const LIGHT_PADDED = /light|leggero|leggera|ultra|packable|sleeveless|smanicat|gilet|vest/i;

/** A padded / quilted / down piece of outerwear (any weight). */
export function isPadded(item: { category?: string | null; subcategory?: string | null; styleTags?: string[] | null; material?: string[] | null }): boolean {
  if (item.category !== "Outerwear") return false;
  return PADDED.test(`${item.subcategory ?? ""} ${(item.styleTags ?? []).join(" ")} ${(item.material ?? []).join(" ")}`);
}

/** A padded piece light enough for 10–17 °C: a puffer vest, a light / packable down jacket, or a
 *  short puffer (stored with length Short). */
export function isLightPadded(item: { category?: string | null; subcategory?: string | null; styleTags?: string[] | null; material?: string[] | null; length?: string | null }): boolean {
  if (!isPadded(item)) return false;
  return item.length === "Short" || LIGHT_PADDED.test(`${item.subcategory ?? ""} ${(item.styleTags ?? []).join(" ")}`);
}

/** A leather jacket stops at LEATHER_MAX_C: from there on it is too warm even in the evening. */
export const LEATHER_MAX_C = 22;
const LEATHER = /leather|pelle|suede|camoscio/i;

/** A leather or suede jacket (not a coat: a long leather coat counts as a coat). */
export function isLeatherJacket(item: { category?: string | null; subcategory?: string | null; material?: string[] | null }): boolean {
  if (item.category !== "Outerwear") return false;
  return /leather jacket|biker/i.test(item.subcategory ?? "") || (/jacket|giacc|bomber|shacket/i.test(item.subcategory ?? "") && LEATHER.test((item.material ?? []).join(" ")));
}

export const MID_SEASON_OUTER_PROMPT_RULE =
  "OUTER LAYER BY TEMPERATURE — use the OUTER-LAYER TEMPERATURE given with the weather (perceived temperature over the hours the person is out, already adjusted to how cold they feel), not the bare number: " +
  "24\u00b0C and above: no outer layer. 20\u201323\u00b0C: only if needed, a light blazer, a linen or denim jacket, a cardigan (mostly for the evening). " +
  "17\u201319\u00b0C: a denim jacket, a blazer, a light trench, a leather jacket in the evening. 11\u201316\u00b0C: a leather jacket, a trench, a lightly padded jacket or a sleeveless puffer over a knit. " +
  "7\u201310\u00b0C: a wool coat, a wool jacket, a short puffer. Below 7\u00b0C: a long coat, a long puffer or a parka, plus a scarf. " +
  "Never a heavy coat or a wool jacket above 10\u00b0C, nothing padded above 17\u00b0C, no leather jacket from 22\u00b0C. In the rain lean towards a trench or a water-resistant layer within the band.";

// ---- The temperature an outfit is chosen for -------------------------------------------------

/** How cold the person feels: «freddolosa» dresses as if it were 3 °C colder, «calorosa» 3 °C warmer. */
export type ColdSensitivity = "cold" | "normal" | "warm";
export const SENSITIVITY_OFFSET_C: Record<ColdSensitivity, number> = { cold: -3, normal: 0, warm: 3 };

/** A temperature as this person feels it (null stays null). */
export function forPerson(t: number | null | undefined, sensitivity: ColdSensitivity | null | undefined): number | null {
  if (t == null || Number.isNaN(t)) return null;
  return t + SENSITIVITY_OFFSET_C[sensitivity ?? "normal"];
}

/** Hours the day's outer layer has to cover: from now (not before 8:00) to 20:00. */
const OUT_FROM = 8;
const OUT_TO = 20;

/**
 * The temperature the outer layer is chosen for: the perceived temperature (wind and humidity:
 * 12 °C with wind feel like 8) at the coldest hour the person is out today, from now to the
 * evening — a 9 °C morning that turns into a 16 °C afternoon still needs the morning's layer.
 * Hours on the day's min/max curve (commute-weather.ts), shifted by how far the perceived
 * temperature is from the air temperature right now. Without a min/max: the perceived temperature now.
 */
export function outerLayerTemperature(w: {
  temperature?: number | null; apparentTemperature?: number | null;
  tempMin?: number | null; tempMax?: number | null; localHour?: number | null;
}): number | null {
  const air = w.temperature ?? null;
  const feels = w.apparentTemperature ?? air;
  if (feels == null) return null;
  if (w.tempMin == null || w.tempMax == null || air == null) return feels;
  const delta = feels - air;
  const from = Math.max(OUT_FROM, Math.floor(w.localHour ?? OUT_FROM));
  if (from > OUT_TO) return feels;
  let coldest = feels;
  for (let h = from; h <= OUT_TO; h++) coldest = Math.min(coldest, temperatureAt(h, w.tempMin, w.tempMax) + delta);
  return Math.round(coldest * 10) / 10;
}

/** Outerwear for real cold: a Coat, Parka or Puffer (or a shearling, a down coat), and any wool
 *  jacket ("giacchetto di lana" — reported too), not a trench, a raincoat or a blazer. */
export function isHeavyCoat(item: { category?: string | null; subcategory?: string | null; styleTags?: string[] | null; material?: string[] | null; length?: string | null }): boolean {
  if (item.category !== "Outerwear") return false;
  if (isLightPadded(item)) return false;
  const sub = item.subcategory ?? "";
  const text = `${sub} ${(item.styleTags ?? []).join(" ")}`;
  if (MID_SEASON_COAT.test(text)) return false;
  if (HEAVY_COAT_TYPE.test(sub.trim()) || HEAVY_COAT_TEXT.test(text)) return true;
  return !TAILORED.test(sub) && WOOL.test((item.material ?? []).join(" "));
}

// From here up (still below HOT) the genuinely WINTER pieces are out: wool and other heavy
// cold-weather fabrics, and boots. A wool skirt with ankle boots on a 23°C September day is
// not a "mild" choice, it is the wrong season — but a light knit or a sweater is still
// plausible at 22-25°C, which is why only the strong winter signals below apply in this
// band and the broader HEAVY_SIGNAL (sweaters, sweatshirts, hoodies…) keeps waiting for HOT.
export const WARM_HEAVY_THRESHOLD_C = 22;
export const WARM_HEAVY_SIGNAL =
  /coat|cappotto|piumino|parka|overcoat|puffer|shearling|montone|wool|lana|felted|fleece|boots?\b|stivali|stivaletti|tweed|corduroy|velluto a coste|velvet|velluto|flannel|flanella|cashmere|cachemire/i;

/** Coarse temperature band, used to key the Home look cache: a look composed in the
 *  cool of the morning must not survive an afternoon that turned hot (that is how a
 *  wool skirt and ankle boots ended up on a 29°C "Today's edit"). "na" = no reading. */
export function tempBucket(temperature: number | null | undefined): "na" | "cold" | "cool" | "mild" | "warm" | "hot" {
  if (temperature == null || Number.isNaN(temperature)) return "na";
  if (temperature <= COLD_THRESHOLD_C) return "cold";
  if (temperature < MILD_COOL_THRESHOLD_C) return "cool";
  if (temperature < WARM_HEAVY_THRESHOLD_C) return "mild";
  if (temperature < HOT_THRESHOLD_C) return "warm";
  return "hot";
}

// Milder than HOT/COLD_THRESHOLD_C on purpose — those exclude outright (a
// wool coat at 32°C), these only inform a PREFERENCE between two
// otherwise-equal choices (a long-sleeve top isn't wrong at 21°C, just a
// less ideal pick than a short-sleeve one when both are equally
// appropriate otherwise). Shared here — not duplicated in
// trip-capsule.server.ts and ai-suggest-outfit.functions.ts separately —
// so both capsule building and the final per-slot pick agree on the same
// boundary.
export const MILD_WARM_THRESHOLD_C = 20;
export const MILD_COOL_THRESHOLD_C = 16;

export const HEAVY_SIGNAL =
  /coat|cappotto|piumino|parka|overcoat|puffer|shearling|montone|wool|lana|maglione|sweater|sweatshirt|felpa|hoodie|felted|fleece|boots?\b|stivali|tweed|corduroy|velluto a coste|velvet|velluto|flannel|flanella|cashmere|cachemire/i;
export const LIGHT_SIGNAL = /tank|canotta|sandal|sandalo|shorts?\b|infradito|flip.?flop|sleeveless|senza maniche/i;

// A blazer/structured jacket is lighter than a real coat — HEAVY_SIGNAL
// above deliberately doesn't catch it, a coat at 26°C is a different
// problem than a blazer at 22°C. But nothing else caught it either: a
// blazer read as fine at any temperature below HOT_THRESHOLD_C, which is
// how "a blouse + blazer" kept getting proposed for a 22°C day and
// reading as overdressed. This is prompt guidance, not a hard
// catalog-level exclusion like violatesWeatherRule below — whether a
// jacket is "too much" depends on what's under it (a blazer over a tank
// reads differently than over a blouse), which is a compositional
// judgment about the whole outfit, not a fact about the jacket item
// alone. Shared here so ai-suggest-outfit.functions.ts,
// suggest-daily-looks.functions.ts and stylist-chat.functions.ts all
// give the model the exact same wording — this file's own header
// explains what happened last time the same rule lived in more than
// one place and drifted.
export const BLAZER_WARMTH_THRESHOLD_C = 20;
export const BLAZER_WARMTH_PROMPT_RULE =
  "JACKET/BLAZER WARMTH: a blazer, suit jacket, or other structured jacket (a full coat is a separate matter, already excluded above 26°C) reads as overdressed and too warm once it's " +
  "20\u00b0C or warmer \u2014 don't propose one purely to satisfy formality once the weather is that mild. If formality genuinely still calls for a jacket/blazer at 20\u00b0C or above, pair it with the LIGHTEST base layer available " +
  "(a t-shirt or tank top) rather than a blouse or long-sleeve shirt \u2014 a blazer over a blouse is two real layers plus the jacket, which is too warm for that temperature even though each piece alone looks fine on paper. " +
  "Below 20\u00b0C, a blazer or jacket over a blouse or shirt is completely normal.";

export interface WeatherCheckableItem {
  category?: string | null;
  subcategory?: string | null;
  styleTags?: string[] | null;
  material?: string[] | null;
  season?: string | null;
  toeShape?: string | null;
  length?: string | null;
}

/** True if a single item is wrong for the given temperature. `temperature
 *  == null` always returns false — no weather data means no opinion,
 *  never a guess. */
export function violatesWeatherRule(item: WeatherCheckableItem, temperature: number | null, outerTemp?: number | null): boolean {
  if (temperature == null) return false;
  // Outer layers follow the outer-layer temperature (the coldest perceived hour out) when known.
  const ot = outerTemp ?? temperature;
  const hot = temperature >= HOT_THRESHOLD_C;
  const cold = temperature <= COLD_THRESHOLD_C;
  const warmHeavy = temperature >= WARM_HEAVY_THRESHOLD_C;
  if (ot > COLD_THRESHOLD_C && isHeavyCoat(item)) return true;
  if (ot > MID_SEASON_MAX_C && isPadded(item)) return true;
  if (ot >= LEATHER_MAX_C && isLeatherJacket(item)) return true;
  if (!hot && !cold && !warmHeavy) return false;

  const text = `${item.category ?? ""} ${item.subcategory ?? ""} ${(item.styleTags ?? []).join(" ")} ${(item.material ?? []).join(" ")}`;
  // season is stored as a comma-joined multi-value string (e.g.
  // "Autumn, Winter"), never a single exact value — .includes() is
  // deliberate, an === check silently never matches most cold-weather
  // garments (this was exactly the Home engine's bug).
  const season = (item.season ?? "").toLowerCase();

  if (hot) {
    if (season.includes("winter")) return true;
    if (HEAVY_SIGNAL.test(text)) return true;
  }
  if (warmHeavy && WARM_HEAVY_SIGNAL.test(text)) return true;
  if (cold) {
    if (season.includes("summer") && LIGHT_SIGNAL.test(text)) return true;
    // Structured signal, not just text pattern-matching: an item
    // explicitly tagged Open Toe is a bare-foot shoe in cold weather
    // regardless of what its subcategory text happens to say.
    if (item.toeShape === "Open Toe") return true;
  }
  return false;
}

/** True if ANY item among the given ids (looked up in `catalog`) violates
 *  the weather rule — the shape every generator actually needs. */
export function anyItemViolatesWeather<T extends WeatherCheckableItem & { id: string }>(
  ids: string[],
  catalog: T[],
  temperature: number | null,
  outerTemp?: number | null
): boolean {
  if (temperature == null) return false;
  return ids.some((id) => {
    const item = catalog.find((c) => c.id === id);
    if (!item) return false;
    return violatesWeatherRule(item, temperature, outerTemp);
  });
}

/** True if the chosen ids include a top/dress whose sleeve length fights
 *  the real temperature AND a better-suited alternative sat unused in the
 *  same catalog. That second condition is what keeps this a genuine
 *  preference rather than a new hard rule: if a short-sleeve top is truly
 *  the only one available, choosing it for a cool evening is not a
 *  violation — there was nothing else to pick.
 *
 *  This is what actually decides which of two capsule members wins a
 *  specific day/evening slot. Building the capsule (trip-capsule.server.ts)
 *  only decides which items make it IN at all — once both a t-shirt and a
 *  long-sleeve shirt are capsule members, only this check (run on the
 *  model's actual per-slot choice, with a retry on failure, same
 *  mechanism as anyItemViolatesWeather) makes the day/evening contrast
 *  something enforced rather than hoped for from a prompt sentence. */
export function violatesSleeveClimate<T extends WeatherCheckableItem & { id: string; sleeveLength?: string | null }>(
  ids: string[],
  catalog: T[],
  temperature: number | null
): boolean {
  if (temperature == null) return false;
  const warm = temperature >= MILD_WARM_THRESHOLD_C;
  const cool = temperature < MILD_COOL_THRESHOLD_C;
  if (!warm && !cool) return false;

  const isTopLike = (c: T) => c.category === "Tops" || c.category === "Dresses";
  const sleeveOf = (c: T) => (c.sleeveLength ?? "").toLowerCase();
  const isLong = (c: T) => sleeveOf(c) === "long sleeve";
  const isShort = (c: T) => sleeveOf(c) === "sleeveless" || sleeveOf(c) === "short sleeve";

  return ids.some((id) => {
    const chosen = catalog.find((c) => c.id === id);
    if (!chosen || !isTopLike(chosen)) return false;
    const mismatched = (warm && isLong(chosen)) || (cool && isShort(chosen));
    if (!mismatched) return false;
    return catalog.some((c) => isTopLike(c) && !ids.includes(c.id) && (warm ? isShort(c) : isLong(c)));
  });
}

// ---------------------------------------------------------------------------------------------------
// SUMMER IS OVER. A warm October afternoon in Italy doesn't bring linen, sleeveless dresses, shorts or
// sandals back: the day starts at 12°C. Outside summer (June–September) and with a cool morning, the
// pieces made for summer are left out — but only where they really are summer pieces and where their
// category still has something else. In a place where mornings stay warm (Marrakech, the Bahamas)
// nothing changes: it is the morning, not the month alone, that decides.
// ---------------------------------------------------------------------------------------------------
export const COOL_MORNING_C = 15;
const SUMMER_FABRIC = /\blinen\b|\blino\b|seersucker|raffia|rafia/i;

export type SeasonCheckableItem = WeatherCheckableItem & { sleeveLength?: string | null; formality?: number | null };

/** Made for summer: linen (whatever its season tag), or a sleeveless / tank / shorts / sandal /
 *  open-toe piece the person tagged only for spring–summer (one tagged for autumn, winter or all
 *  seasons — a sleeveless top worn under a jacket all year — is not). */
export function isSummerPiece(item: SeasonCheckableItem): boolean {
  const text = `${item.subcategory ?? ""} ${(item.styleTags ?? []).join(" ")} ${(item.material ?? []).join(" ")}`;
  if (SUMMER_FABRIC.test(text)) return true;
  // Fine heeled sandals for a gala are worn in winter too (with tights) — not a summer piece.
  if (item.category === "Shoes" && (item.formality ?? 0) >= 4) return false;
  const season = (item.season ?? "").toLowerCase();
  const yearRound = /autumn|fall|winter|all/.test(season);
  if (yearRound || !/summer|spring/.test(season)) return false;
  return LIGHT_SIGNAL.test(text) || (item.sleeveLength ?? "").toLowerCase() === "sleeveless" || item.toeShape === "Open Toe";
}

/** Outside summer, with a morning below COOL_MORNING_C. No morning reading → no opinion. */
export function summerIsOver(dateIso: string | null | undefined, morningTemp: number | null | undefined): boolean {
  return morningTemp != null && !Number.isNaN(morningTemp) && morningTemp < COOL_MORNING_C && !isSummerSeason(dateIso);
}

/** The items to offer once summer is over: summer pieces out, unless one is the only thing its
 *  category has (a look is never left without shoes because every pair is a sandal). */
export function withoutSummerPieces<T extends SeasonCheckableItem>(items: T[], dateIso: string | null | undefined, morningTemp: number | null | undefined): T[] {
  if (!summerIsOver(dateIso, morningTemp)) return items;
  const hasOther = new Set(items.filter((it) => !isSummerPiece(it)).map((it) => it.category ?? ""));
  return items.filter((it) => !isSummerPiece(it) || !hasOther.has(it.category ?? ""));
}

export function summerOverPromptRule(morningTemp: number): string {
  return `SUMMER IS OVER: the morning starts around ${Math.round(morningTemp)}°C. Even if the afternoon is warm, never propose linen, sleeveless dresses or tops, shorts, tank tops or sandals that belong to summer — choose autumn pieces, with a layer for the cool morning.`;
}
