// Two things a person weighs before buying that the advisor ignored:
//  - the SAME model already owned (two Victoria Beckham Alina jeans owned → a third Alina, in a
//    slightly darker wash, is a variant, not something new);
//  - the price against what THIS person usually spends on that kind of piece: 450 € for jeans is a
//    lot for someone whose jeans cost 50 €, normal for someone whose jeans cost 400 €.

import type { WardrobeItem } from "./aura-types";
import { convertCurrency } from "./currency-rates";
import { parsePositivePrice } from "./price-parse";
import { colorLightness } from "./outfit-match";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Owned pieces of the same brand AND model as the product (the model name appears in the product's
 *  name), any type within the category (Alina jeans and Alina trousers are the same model). */
export function sameModelOwned(
  product: { brand: string | null; title: string | null; category: string | null },
  wardrobe: WardrobeItem[],
): WardrobeItem[] {
  const brand = norm(product.brand);
  const title = ` ${norm(product.title)} `;
  if (!brand || title.trim() === "") return [];
  return wardrobe.filter((it) => {
    const model = norm(it.model);
    if (!model || model.length < 3) return false;
    if (norm(it.brand) !== brand) return false;
    if (product.category && it.category && it.category !== product.category) return false;
    return title.includes(` ${model} `);
  });
}

export type PriceContext = {
  priceEur: number;
  /** Median of what the person paid for this kind of piece (EUR). */
  usualEur: number;
  /** The top of what they usually pay for it (90th percentile, EUR). */
  topEur: number;
  /** How many priced pieces it comes from. */
  basedOn: number;
  /** above_usual = beyond even the top of their range; upper_range = within their range but at its
   *  expensive end; usual / below_usual. */
  tier: "above_usual" | "upper_range" | "usual" | "below_usual";
  /** What they paid for the same model, when it's owned and priced (EUR). */
  sameModelPaidEur: number | null;
};

function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** The product's price against what THIS person pays for the SAME kind of piece — never the whole
 *  category: a cashmere sweater compared with t-shirts, or jeans with leggings and shorts, gives a
 *  meaningless "usual price". The pool is the same type and, when the material is known and enough
 *  pieces share it, the same material too (cashmere with cashmere). Fewer than 3 priced pieces of
 *  the same type: no price judgement at all rather than a wrong one. Not the median alone either:
 *  someone whose jeans usually cost 170 € but who has several at 400–600 € isn't spending "more
 *  than usual" on a 400 € pair, it's the expensive end of their own range. */
export function priceContext(
  product: { price: string | null; currency: string | null; category: string | null; subcategory?: string | null; material?: string | null },
  wardrobe: WardrobeItem[],
  sameModel: WardrobeItem[] = [],
): PriceContext | null {
  const amount = parsePositivePrice(product.price);
  if (amount == null || !product.subcategory) return null;
  const priceEur = convertCurrency(amount, (product.currency ?? "EUR").toUpperCase(), "EUR");
  const eur = (it: WardrobeItem) => {
    const p = parsePositivePrice((it as { price?: unknown }).price);
    return p == null ? null : convertCurrency(p, String((it as { currency?: string | null }).currency ?? "EUR").toUpperCase(), "EUR");
  };
  const priced = (items: WardrobeItem[]) => items.map(eur).filter((x): x is number => x != null);
  const sameType = wardrobe.filter((it) => it.category === product.category && it.subcategory === product.subcategory);
  const material = norm(product.material);
  const sameMaterial = material
    ? sameType.filter((it) => (Array.isArray(it.material) ? it.material : []).some((m) => { const n = norm(m); return n && (n.includes(material) || material.includes(n)); }))
    : [];
  const pool = priced(sameMaterial).length >= 3 ? priced(sameMaterial) : priced(sameType);
  if (pool.length < 3) return null;
  const usualEur = percentile(pool, 0.5);
  const topEur = percentile(pool, 0.9);
  const paid = priced(sameModel);
  const sameModelPaidEur = paid.length ? percentile(paid, 0.5) : null;
  let tier: PriceContext["tier"] =
    priceEur > topEur * 1.2 ? "above_usual"
    : priceEur > usualEur * 1.5 ? "upper_range"
    : priceEur < usualEur * 0.67 ? "below_usual"
    : "usual";
  // Already paid about this much for the same model: it is within their habits by definition.
  if (tier === "above_usual" && sameModelPaidEur != null && priceEur <= sameModelPaidEur * 1.25) tier = "upper_range";
  return { priceEur: Math.round(priceEur), usualEur: Math.round(usualEur), topEur: Math.round(topEur), basedOn: pool.length, tier, sameModelPaidEur: sameModelPaidEur == null ? null : Math.round(sameModelPaidEur) };
}

/** "darker" / "lighter" when the product's colour is clearly darker or lighter than the owned piece's. */
export function shadeDifference(productColors: string[], ownedColors: string[]): "darker" | "lighter" | null {
  const avg = (cs: string[]) => {
    const ls = cs.map(colorLightness).filter((x): x is number => x != null);
    return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
  };
  const p = avg(productColors), o = avg(ownedColors);
  if (p == null || o == null) return null;
  if (p <= o - 6) return "darker";
  if (p >= o + 6) return "lighter";
  return null;
}

/** On top of the wardrobe/fashion verdict, never an upgrade:
 *  - far beyond what the person usually pays for this kind of piece (above the top of their range)
 *    while something similar is already owned and it isn't an iconic piece → "skip": it adds nothing
 *    but the label (1100 € jeans next to a similar pair, when jeans usually cost up to ~360 €);
 *  - the same model already owned and a price at the top of (or above) their range, or two of the
 *    same model already → "maybe" instead of "buy". */
export function applyPurchaseContext<V extends { verdict: "buy" | "maybe" | "skip"; confidence: "high" | "medium" | "low" }>(
  base: V,
  ctx: { sameModelCount: number; price: PriceContext | null; wardrobeGap: boolean; similarOwned?: boolean; iconic?: boolean },
): V {
  if (base.verdict === "skip" || ctx.wardrobeGap) return base;
  if (ctx.price?.tier === "above_usual" && ctx.similarOwned && !ctx.iconic) return { ...base, verdict: "skip", confidence: "medium" };
  if (base.verdict !== "buy") return base;
  if (ctx.sameModelCount >= 1 && (ctx.price?.tier === "above_usual" || ctx.price?.tier === "upper_range")) return { ...base, verdict: "maybe", confidence: "medium" };
  if (ctx.sameModelCount >= 2) return { ...base, verdict: "maybe", confidence: "medium" };
  return base;
}

// ---------------------------------------------------------------------------------------------
// Cost per wear. The price alone says little: jeans worn all year cost less per wear than an evening
// gown, a summer-only mini dress, a cut-out piece or crystal heels. Expected wears come from the
// person's own history for that kind of piece once there is enough of it (6+ months, 3+ pieces);
// otherwise an ESTIMATE of how usable the piece is: a modest base for its kind, then its seasons
// (all year vs one season), day/evening range, how dressy it is, statement details (crystals,
// sequins, cut-outs), whether it is timeless or a trend piece, its versatility — and the similar
// pieces it would rotate with. The reasons are returned so the person sees why.
// ---------------------------------------------------------------------------------------------

/** A modest base: wears per year of ONE everyday, all-season piece of this kind. */
const BASE_WEARS: [RegExp, number][] = [
  [/sneaker|trainer/i, 40],
  [/bag|tote|shoulder|crossbody|backpack|borsa/i, 40],
  [/watch|orologio|ring|anello|bracelet|bracciale|necklace|collana|earring|orecchin/i, 50],
  [/jeans/i, 30],
  [/legging/i, 25],
  [/trouser|pant|chino|cargo/i, 25],
  [/loafer|flat|ballerin|mocassin|boot|stival/i, 25],
  [/coat|trench|parka|puffer|cappotto/i, 25],
  [/t-?shirt|tank|camisole|bodysuit|top|polo/i, 20],
  [/blazer/i, 20],
  [/sweater|knit|cardigan|jumper|sweatshirt|hoodie/i, 18],
  [/shirt|blouse|camicia/i, 18],
  [/jacket|giacca|shacket|bomber/i, 18],
  [/belt|cintura|sunglass|occhiali/i, 25],
  [/skirt|gonna/i, 15],
  [/short/i, 12],
  [/pump|heel|sandal|slingback|mule|décolleté|decollete/i, 12],
  [/scarf|sciarpa|foulard/i, 15],
  [/dress|abito|jumpsuit|tuta/i, 10],
  [/clutch|minaudi/i, 8],
];

export type WearReason = "allSeasons" | "oneSeason" | "fewSeasons" | "dayAndEvening" | "eveningOnly" | "veryDressy" | "statement" | "trendPiece" | "timeless" | "versatile" | "notVersatile" | "rotation";

export type CostPerWear = {
  wearsPerYear: number;
  /** Years the cost is spread over (shown to the person). */
  years: number;
  costPerWearEur: number;
  /** Similar pieces of the same type already owned (they share the wears). */
  rotatingWith: number;
  basis: "history" | "estimate";
  /** Why the estimate is what it is (only for basis "estimate"). */
  reasons: WearReason[];
};

export const CPW_YEARS = 2;

export type WearProfile = {
  category: string | null;
  subcategory: string | null;
  seasons?: string[];
  dayEvening?: string | null;
  formality?: number | null;
  /** Detail keys (garment-details.ts) of the product, e.g. embellished, cutOut. */
  details?: string[];
  fashion?: { timeless: boolean; onTrend: boolean; versatility: "low" | "medium" | "high" } | null;
};

/** Estimated wears per year of the piece and why (no history). */
export function estimateWears(p: WearProfile, rotatingWith: number): { wearsPerYear: number; reasons: WearReason[] } {
  const kind = `${p.subcategory ?? ""} ${p.category ?? ""}`;
  let w = BASE_WEARS.find(([re]) => re.test(kind))?.[1] ?? 12;
  const reasons: WearReason[] = [];
  const seasons = (p.seasons ?? []).map((x) => x.toLowerCase());
  if (seasons.includes("all seasons") || seasons.length >= 4) reasons.push("allSeasons");
  else if (seasons.length === 1) { w *= 0.45; reasons.push("oneSeason"); }
  else if (seasons.length === 2 || seasons.length === 3) { w *= 0.75; reasons.push("fewSeasons"); }
  if (p.dayEvening === "evening") { w *= 0.35; reasons.push("eveningOnly"); }
  else if (p.dayEvening === "both") { w *= 1.1; reasons.push("dayAndEvening"); }
  if ((p.formality ?? 0) >= 5) { w *= 0.5; reasons.push("veryDressy"); }
  if ((p.details ?? []).some((d) => d === "embellished" || d === "cutOut")) { w *= 0.55; reasons.push("statement"); }
  if (p.fashion?.onTrend && !p.fashion.timeless) { w *= 0.8; reasons.push("trendPiece"); }
  else if (p.fashion?.timeless) { w *= 1.1; reasons.push("timeless"); }
  if (p.fashion?.versatility === "high") { w *= 1.15; reasons.push("versatile"); }
  else if (p.fashion?.versatility === "low") { w *= 0.6; reasons.push("notVersatile"); }
  // Many similar pieces in rotation share the wears (softly: square root).
  if (rotatingWith > 3) { w /= Math.sqrt((rotatingWith + 1) / 4); reasons.push("rotation"); }
  return { wearsPerYear: Math.max(1, Math.round(w)), reasons };
}

export function costPerWear(
  product: WearProfile,
  wardrobe: WardrobeItem[],
  price: PriceContext | null,
  now: Date = new Date(),
): CostPerWear | null {
  if (!price || !product.subcategory) return null;
  const sameType = wardrobe.filter((it) => it.category === product.category && it.subcategory === product.subcategory && !(it as { archived?: boolean }).archived);
  // Own history: wears per year of owned pieces of this type that have been around long enough.
  const yearsOwned = (it: WardrobeItem) => {
    const since = (it as { purchase_date?: string | null }).purchase_date || (it as { created_at?: string }).created_at;
    return since ? (now.getTime() - new Date(since).getTime()) / (365 * 86400000) : 0;
  };
  const seasoned = sameType.filter((it) => yearsOwned(it) >= 0.5);
  let wearsPerYear: number;
  let basis: CostPerWear["basis"];
  let reasons: WearReason[] = [];
  if (seasoned.length >= 3) {
    wearsPerYear = Math.max(1, Math.round(percentile(seasoned.map((it) => ((it as { worn_count?: number }).worn_count ?? 0) / yearsOwned(it)), 0.5)));
    basis = "history";
  } else {
    ({ wearsPerYear, reasons } = estimateWears(product, sameType.length));
    basis = "estimate";
  }
  return {
    wearsPerYear,
    years: CPW_YEARS,
    costPerWearEur: Math.round(price.priceEur / (wearsPerYear * CPW_YEARS)),
    rotatingWith: sameType.length,
    basis,
    reasons,
  };
}
