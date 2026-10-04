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
  /** Median of what the person paid for owned pieces of this category (EUR). */
  usualEur: number;
  /** How many priced pieces the median comes from. */
  basedOn: number;
  tier: "above_usual" | "usual" | "below_usual";
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The product's price against the person's own usual spend for that category (needs at least 3
 *  priced pieces of the category, otherwise the whole wardrobe's priced pieces). */
export function priceContext(
  product: { price: string | null; currency: string | null; category: string | null },
  wardrobe: WardrobeItem[],
): PriceContext | null {
  const amount = parsePositivePrice(product.price);
  if (amount == null) return null;
  const priceEur = convertCurrency(amount, (product.currency ?? "EUR").toUpperCase(), "EUR");
  const eur = (it: WardrobeItem) => {
    const p = parsePositivePrice((it as { price?: unknown }).price);
    return p == null ? null : convertCurrency(p, String((it as { currency?: string | null }).currency ?? "EUR").toUpperCase(), "EUR");
  };
  const ofCategory = wardrobe.filter((it) => it.category === product.category).map(eur).filter((x): x is number => x != null);
  const pool = ofCategory.length >= 3 ? ofCategory : wardrobe.map(eur).filter((x): x is number => x != null);
  if (pool.length < 3) return null;
  const usualEur = median(pool);
  const tier = priceEur > usualEur * 1.5 ? "above_usual" : priceEur < usualEur * 0.67 ? "below_usual" : "usual";
  return { priceEur: Math.round(priceEur), usualEur: Math.round(usualEur), basedOn: pool.length, tier };
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

/** On top of the wardrobe/fashion verdict: the same model already owned AND a price above what the
 *  person usually spends on that kind of piece → "maybe" instead of "buy" (worth weighing, not an
 *  easy yes). Never upgrades. */
export function applyPurchaseContext<V extends { verdict: "buy" | "maybe" | "skip"; confidence: "high" | "medium" | "low" }>(
  base: V,
  ctx: { sameModelCount: number; price: PriceContext | null; wardrobeGap: boolean },
): V {
  if (base.verdict !== "buy" || ctx.wardrobeGap) return base;
  if (ctx.sameModelCount >= 1 && ctx.price?.tier === "above_usual") return { ...base, verdict: "maybe", confidence: "medium" };
  if (ctx.sameModelCount >= 2) return { ...base, verdict: "maybe", confidence: "medium" };
  return base;
}
