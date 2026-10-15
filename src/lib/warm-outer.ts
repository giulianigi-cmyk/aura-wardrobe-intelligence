// A warm outer layer, for a day that starts at 10°C or below, and a dressy one, for work. Shared by
// the trip planner (trip-capsule.server.ts) and the outfit engine (ai-suggest-outfit.functions.ts).
//  - A trench — even one called "Trench Coat" — and a raincoat are mid-season layers: fine at 15°C,
//    too cold for a 5°C morning (Düsseldorf in October).
//  - A parka is warm only when it is padded or lined (down, wool, quilted) or made for winter: a
//    light polyester autumn parka is not — the name alone used to win over a wool coat.
//  - A puffer, a parka, a bomber, a sporty or streetwear piece is not dressy: at a trade fair or a
//    client meeting the warm layer is a coat, as long as the wardrobe has one.
import { RAIN_READY_OUTER } from "./rain-rules";

export type OuterCheckable = {
  category?: string | null;
  subcategory?: string | null;
  material?: string[] | string | null;
  season?: string | null;
  style?: string[] | string | null;
  styleTags?: string[] | null;
  formality?: number | null;
};

const MID_SEASON = /trench|rain|impermeabil|windbreaker|anorak|k-?way|cerata|spolverino|duster/i;
const INSULATED = /puffer|piumino|down|quilted|imbottit|padded|wool|lana|cashmere|shearling|montone|teddy/i;
const COAT = /coat|cappotto|abrigo|manteau/i;
const PARKA = /parka/i;
const CASUAL_OUTER = /puffer|piumino|parka|windbreaker|rain|anorak|denim|bomber|shacket|vest|gilet|fleece|pile|k-?way|hood/i;
const CASUAL_STYLE = /sport|streetwear|athleisure|outdoor|grunge|y2k/i;

function joined(v: string[] | string | null | undefined): string {
  return Array.isArray(v) ? v.join(" ") : v ?? "";
}

/** A coat, a puffer, a padded or winter parka, or a piece in wool, cashmere or shearling — never a
 *  trench, a raincoat or a light parka. */
export function isWarmOuter(it: OuterCheckable): boolean {
  const sub = it.subcategory ?? "";
  if (MID_SEASON.test(sub)) return false;
  if (INSULATED.test(`${sub} ${joined(it.material)}`)) return true;
  if (PARKA.test(sub)) return /winter|inverno|invierno|hiver/i.test(it.season ?? "");
  return COAT.test(sub);
}

/** Warm and made for the rain too: a puffer or a parka, rather than a wool coat that soaks up water. */
export function isWarmAndRainReady(it: OuterCheckable): boolean {
  return isWarmOuter(it) && RAIN_READY_OUTER.test(it.subcategory ?? "");
}

/** Polished enough for work: not a puffer, parka, bomber or denim jacket, not sporty or streetwear,
 *  formality 3 or more. */
export function isDressyOuter(it: OuterCheckable): boolean {
  if (CASUAL_OUTER.test(it.subcategory ?? "")) return false;
  if (CASUAL_STYLE.test(`${joined(it.styleTags)} ${joined(it.style)}`)) return false;
  return (it.formality ?? 3) >= 3;
}
