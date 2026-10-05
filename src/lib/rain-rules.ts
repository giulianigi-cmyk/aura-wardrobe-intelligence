// What not to wear in the rain. Suede, velvet, silk and satin get ruined; white and light colours,
// light canvas shoes and hems that touch the ground get splashed and stained; precious or
// stainable bags don't survive a wet street. A raincoat, trench, parka or puffer is the exception
// for light colours — it is made for the rain. Used by every outfit generator: a piece that
// fails is left out ONLY when another piece of the same category can take its place, so a look is
// never left without shoes or a bag because of the weather.
import { colorLightness } from "./outfit-match";

export type RainCheckable = {
  category?: string | null;
  subcategory?: string | null;
  colors?: string[] | null;
  color?: string | null;
  material?: string[] | string | null;
  styleTags?: string[] | null;
  length?: string | null;
  fit?: string | null;
  toeShape?: string | null;
};

export type RainReason = "delicateFabric" | "lightColour" | "floorLength" | "openOrCanvasShoe" | "preciousBag";

/** Rain, drizzle, showers, snow or a storm (the English labels describeWeather() produces, plus
 *  the same words in the app's other languages). */
export function isWetCondition(condition: string | null | undefined): boolean {
  return /rain|drizzle|shower|snow|thunder|storm|pioggia|piovig|temporale|neve|lluvia|llovizna|tormenta|nieve|pluie|bruine|averse|orage|neige/i.test(condition ?? "");
}

const DELICATE = /suede|camoscio|scamosciat|nubuck|velvet|velluto|terciopelo|velours|silk|seta|seda|soie|satin|raso|chiffon|organza|tulle|mohair/i;
export const RAIN_READY_OUTER = /rain|impermeabil|trench|parka|puffer|piumino|windbreaker|anorak|k-?way|cerata/i;
// Open at the heel or the toe: the foot gets wet and the shoe slips on a wet street.
const OPEN_OR_CANVAS_SHOE = /sandal|espadrill|slide|flip.?flop|infradito|ciabatt|canvas|tela|raffia|jute|slingback|mule|sabot|peep.?toe|open.?toe/i;
const PRECIOUS_OR_STAINABLE = /raffia|straw|paglia|wicker|vimini|canvas|tela|crystal|cristall|swarovski|rhinestone|strass|sequin|paillett|pearl|perl|embellish|feather|piume|beaded/i;
const FLOOR_LENGTH = /maxi|floor|palazzo|flare|zampa|bootcut|wide[- ]?leg|gamba larga|long dress|evening dress|abito lungo|gown/i;

function text(it: RainCheckable): string {
  const material = Array.isArray(it.material) ? it.material.join(" ") : it.material ?? "";
  return `${it.subcategory ?? ""} ${material} ${(it.styleTags ?? []).join(" ")} ${it.fit ?? ""} ${it.length ?? ""}`;
}

/** White, cream, ivory, beige, pastels: the main colour is light (L* ≥ 75). */
function isLight(it: RainCheckable): boolean {
  const main = it.colors?.[0] ?? it.color ?? "";
  const l = main ? colorLightness(main) : null;
  return l != null && l >= 75;
}

/** Why a piece is wrong in the rain, or null when it is fine. */
export function rainReason(it: RainCheckable): RainReason | null {
  const cat = it.category ?? "";
  const t = text(it);
  if (["Shoes", "Bags", "Outerwear", "Bottoms", "Dresses", "Jumpsuits"].includes(cat) && DELICATE.test(t)) return "delicateFabric";
  if (cat === "Shoes") {
    if (OPEN_OR_CANVAS_SHOE.test(t) || it.toeShape === "Open Toe") return "openOrCanvasShoe";
    if (isLight(it)) return "lightColour";
  }
  if (cat === "Bags" && PRECIOUS_OR_STAINABLE.test(t)) return "preciousBag";
  if (["Bottoms", "Dresses", "Jumpsuits"].includes(cat)) {
    if (it.length === "Maxi" || FLOOR_LENGTH.test(t)) return "floorLength";
    if (isLight(it)) return "lightColour";
  }
  if (cat === "Outerwear" && isLight(it) && !RAIN_READY_OUTER.test(t)) return "lightColour";
  return null;
}

/** The items to offer on a wet day. The occasion comes first: a piece wrong for the rain is left
 *  out only when the same category has a rain-proof piece that is just as dressy (formality at most
 *  one step lower) — satin pumps give way to leather pumps for a wedding in the rain, never to
 *  flat ankle boots. When no such piece exists, the elegant one stays and the stylist is told to
 *  choose the most rain-tolerant option among what fits the occasion. */
export function filterForRain<T extends RainCheckable & { formality?: number | null }>(items: T[], condition: string | null | undefined): T[] {
  if (!isWetCondition(condition)) return items;
  const level = (it: T) => it.formality ?? 3;
  const okByCategory = new Map<string, number[]>();
  for (const it of items) {
    if (rainReason(it)) continue;
    const key = it.category ?? "";
    okByCategory.set(key, [...(okByCategory.get(key) ?? []), level(it)]);
  }
  return items.filter((it) => {
    if (!rainReason(it)) return true;
    const alternatives = okByCategory.get(it.category ?? "") ?? [];
    return !alternatives.some((f) => f >= level(it) - 1);
  });
}

/** The same rules for the stylist prompt (for what the catalog can't show, and to explain). */
export const RAIN_PROMPT_RULE =
  "RAIN RULE (it is raining or about to). The occasion always comes first: rain never lowers the formality the occasion needs — at a wedding, gala, ceremony or elegant dinner keep elegant pieces and pick, among them, the ones that cope best with rain (leather rather than suede or satin, a darker pair, a coat or trench over the outfit), never flat ankle boots, sneakers or casual pieces because it rains. Within what suits the occasion: never propose suede (shoes, jackets, bags), velvet, silk, satin or other delicate fabrics; no white or light-coloured shoes, trousers, skirts or dresses, and no light-coloured coat or jacket unless it is a raincoat/trench made for the rain; no light canvas shoes, sandals or open toes; no wide/flared trousers or maxi skirts and dresses that touch the ground; no bags in suede, straw, canvas, precious or embellished fabrics. Prefer closed, water-resistant shoes, a dark or practical bag, and as the outer layer a raincoat, trench or — when the occasion allows it — a puffer rather than a wool coat that soaks up water.";

/** On a wet day the look gets a real outer layer when the wardrobe has one: a raincoat, trench or
 *  parka first, otherwise any jacket or coat that isn't itself wrong for the rain. Null when the
 *  look already has one, or nothing suitable exists. */
export function rainLayerFor<T extends RainCheckable & { id: string }>(chosen: T[], candidates: T[]): T | null {
  if (chosen.some((it) => it.category === "Outerwear")) return null;
  const outer = candidates.filter((it) => it.category === "Outerwear" && !rainReason(it));
  return outer.find((it) => RAIN_READY_OUTER.test(text(it))) ?? outer[0] ?? null;
}
