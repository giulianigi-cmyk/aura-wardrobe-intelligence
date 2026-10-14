// A warm outer layer, for a day that starts at 10°C or below: a wool or cashmere coat, a puffer, a
// parka, shearling. Shared by the trip planner (trip-capsule.server.ts) and the outfit engine
// (ai-suggest-outfit.functions.ts). A trench — even one called "Trench Coat" — and a raincoat are
// mid-season layers: fine at 15°C, too cold for a 5°C morning (Düsseldorf in October).
import { RAIN_READY_OUTER } from "./rain-rules";

export type OuterCheckable = { category?: string | null; subcategory?: string | null; material?: string[] | string | null };

const MID_SEASON = /trench|rain|impermeabil|windbreaker|anorak|k-?way|cerata|spolverino|duster/i;
const WARM = /coat|cappotto|puffer|piumino|parka|down|quilted|imbottit|wool|lana|cashmere|shearling|montone|teddy/i;

function material(it: OuterCheckable): string {
  return Array.isArray(it.material) ? it.material.join(" ") : it.material ?? "";
}

/** A coat, a puffer, a parka or a piece in wool, cashmere or shearling — never a trench or a raincoat. */
export function isWarmOuter(it: OuterCheckable): boolean {
  if (MID_SEASON.test(it.subcategory ?? "")) return false;
  return WARM.test(`${it.subcategory ?? ""} ${material(it)}`);
}

/** Warm and made for the rain too: a puffer or a parka, rather than a wool coat that soaks up water. */
export function isWarmAndRainReady(it: OuterCheckable): boolean {
  return isWarmOuter(it) && RAIN_READY_OUTER.test(it.subcategory ?? "");
}
