// «Forse da lavare»: how many times a piece can be worn before a wash, by type, and by the temperature
// of each day it was worn (not the season): a T-shirt worn on a hot day counts as a whole wash, on a
// cold day as half. Each wear adds 1 / (wears allowed at that temperature); at 1 the piece is due.
// Pure, no DB.
//
// Counted from the last wash (into the basket or the dry cleaner) or the last «Ancora pulito», and
// never further back than WINDOW_DAYS (pieces washed outside the app). Underwear, swimwear and
// pyjamas follow the table too; sportswear already goes to the basket after each wear, and outerwear,
// shoes, bags and accessories are washed "when needed", so they are never counted.
import { careProfileFor } from "./laundry-care";

/** Wears before a wash: on a warm day (≥ WARM °C) and on a cold one (≤ COLD °C); in between, the
 *  two blend. */
export type WashRule = { warm: number; cold: number };

export const WARM = 24;
export const COLD = 14;
export const WINDOW_DAYS = 21;

const R = (warm: number, cold: number): WashRule => ({ warm, cold });

type Piece = { category?: string | null; subcategory?: string | null; material?: string[] | null };

/** The rule for a piece, or null when it is not counted. */
export function washRule(item: Piece): WashRule | null {
  const sub = item.subcategory ?? "";
  const wool = careProfileFor(item.material ?? [], item.category) === "wool";
  switch (item.category) {
    case "Underwear":
      if (sub === "Bra") return R(2, 3);
      if (sub === "Sleepwear") return R(3, 4);
      return R(1, 1);
    case "Swimwear":
      return R(1, 1);
    case "Tops":
      if (sub === "Sweater" || sub === "Cardigan") return wool ? R(5, 5) : R(3, 4);
      if (sub === "Sweatshirt" || sub === "Hoodie") return R(3, 5);
      if (sub === "Knit Top") return wool ? R(5, 5) : R(2, 3);
      if (sub === "Shift Dress") return R(2, 3);
      // T-shirts, tanks, camisoles, bodysuits, shirts, blouses: against the skin.
      return R(1, 2);
    case "Bottoms":
      if (sub === "Jeans") return R(3, 5);
      if (sub === "Leggings") return R(1, 2);
      if (sub === "Shorts") return R(2, 3);
      return R(3, 4);
    case "Dresses":
      return sub === "Sweater Dress" ? (wool ? R(5, 5) : R(3, 4)) : R(2, 3);
    case "Jumpsuits":
      return R(2, 3);
    default:
      return null;
  }
}

/** Wears allowed for a wear at this temperature (null: unknown, the mean of the two). */
export function wearsAllowed(rule: WashRule, temp: number | null): number {
  if (temp == null) return (rule.warm + rule.cold) / 2;
  if (temp >= WARM) return rule.warm;
  if (temp <= COLD) return rule.cold;
  const t = (temp - COLD) / (WARM - COLD);
  return rule.cold + (rule.warm - rule.cold) * t;
}

export type Wear = { date: string; temp: number | null };

export type DueInput = {
  rule: WashRule;
  /** Every wear of the piece (any order). */
  wears: Wear[];
  /** Last time it went to the basket or the dry cleaner (ISO date or timestamp). */
  lastWash: string | null;
  /** Last «Ancora pulito». */
  lastCheck: string | null;
  today: string;
};

const day = (iso: string) => iso.slice(0, 10);

function minusDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The wears that count and how full the piece is (1 = due). After «Ancora pulito» it is due again
 *  only after one more wear. Wears on the day of a wash count from the next one (worn, then washed). */
export function laundryLoad(input: DueInput): { load: number; wears: Wear[]; due: boolean } {
  const washed = input.lastWash ? day(input.lastWash) : null;
  const windowStart = minusDays(input.today, WINDOW_DAYS);
  const counted = input.wears
    .filter((w) => w.date >= windowStart && w.date <= input.today && (!washed || w.date > washed))
    .sort((a, b) => a.date.localeCompare(b.date));
  const load = counted.reduce((sum, w) => sum + 1 / wearsAllowed(input.rule, w.temp), 0);
  const checked = input.lastCheck ? day(input.lastCheck) : null;
  const wornAfterCheck = !checked || counted.some((w) => w.date > checked);
  return { load, wears: counted, due: load >= 1 - 1e-9 && wornAfterCheck };
}

/** Months with warm days where nothing better is known (northern / southern hemisphere). */
export function climateGuess(date: string, latitude: number | null): number {
  const m = Number(date.slice(5, 7));
  const north = latitude == null || latitude >= 0;
  const summer = north ? m >= 6 && m <= 8 : m === 12 || m <= 2;
  const winter = north ? m === 12 || m <= 2 : m >= 6 && m <= 8;
  return summer ? 27 : winter ? 8 : 18;
}
