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

/** The product's price against what THIS person pays for the same kind of piece: the same type
 *  (jeans with jeans — at least 5 priced), else the category, else the whole wardrobe. Not the
 *  median alone: someone whose jeans usually cost 170 € but who has several at 400–600 € isn't
 *  spending "more than usual" on a 400 € pair, it's the expensive end of their own range. */
export function priceContext(
  product: { price: string | null; currency: string | null; category: string | null; subcategory?: string | null },
  wardrobe: WardrobeItem[],
  sameModel: WardrobeItem[] = [],
): PriceContext | null {
  const amount = parsePositivePrice(product.price);
  if (amount == null) return null;
  const priceEur = convertCurrency(amount, (product.currency ?? "EUR").toUpperCase(), "EUR");
  const eur = (it: WardrobeItem) => {
    const p = parsePositivePrice((it as { price?: unknown }).price);
    return p == null ? null : convertCurrency(p, String((it as { currency?: string | null }).currency ?? "EUR").toUpperCase(), "EUR");
  };
  const priced = (items: WardrobeItem[]) => items.map(eur).filter((x): x is number => x != null);
  const ofType = product.subcategory ? priced(wardrobe.filter((it) => it.category === product.category && it.subcategory === product.subcategory)) : [];
  const ofCategory = priced(wardrobe.filter((it) => it.category === product.category));
  const pool = ofType.length >= 5 ? ofType : ofCategory.length >= 3 ? ofCategory : priced(wardrobe);
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

/** On top of the wardrobe/fashion verdict: the same model already owned AND a price at the top of (or
 *  above) what the person usually spends on that kind of piece → "maybe" instead of "buy" (worth weighing, not an
 *  easy yes). Never upgrades. */
export function applyPurchaseContext<V extends { verdict: "buy" | "maybe" | "skip"; confidence: "high" | "medium" | "low" }>(
  base: V,
  ctx: { sameModelCount: number; price: PriceContext | null; wardrobeGap: boolean },
): V {
  if (base.verdict !== "buy" || ctx.wardrobeGap) return base;
  if (ctx.sameModelCount >= 1 && (ctx.price?.tier === "above_usual" || ctx.price?.tier === "upper_range")) return { ...base, verdict: "maybe", confidence: "medium" };
  if (ctx.sameModelCount >= 2) return { ...base, verdict: "maybe", confidence: "medium" };
  return base;
}
