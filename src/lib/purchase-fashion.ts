// Fashion value of a piece the person is considering: the advisor used to judge purchases only on
// what is already in the wardrobe (duplicates, pairings, gaps), so a recognisable, status-signalling
// piece — a Cartier Love bracelet, a Chanel 2.55, Rene Caovilla Cleo sandals, a Louboutin patent
// slingback — got the same verdict as any similar-looking piece. These signals come from the
// model's general fashion knowledge (it knows the houses' signature designs; its idea of what is
// "in" right now can be out of date — the app says so to the person).

import { z } from "zod";

export type FashionSignals = {
  /** A signature, instantly recognisable design of its house. */
  iconic: boolean;
  /** Will still look right in years (not tied to one season). */
  timeless: boolean;
  /** Currently fashionable, as far as the model knows. */
  onTrend: boolean;
  /** Reads as a status / luxury signal. */
  statusPiece: boolean;
  /** How many kinds of occasion it works for. */
  versatility: "low" | "medium" | "high";
  /** One short, factual note (e.g. "patent slingbacks are a strong trend this season"). */
  note: string;
};

const bool = z.preprocess((v) => v === true || v === "true", z.boolean());
export const FashionSignalsSchema = z.object({
  iconic: bool,
  timeless: bool,
  onTrend: bool,
  statusPiece: bool,
  versatility: z.preprocess((v) => (v === "low" || v === "medium" || v === "high" ? v : "medium"), z.enum(["low", "medium", "high"])),
  note: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 200) : ""), z.string()),
});

export function fashionPrompt(p: { brand: string | null; title: string | null; category: string | null; subcategory: string | null; colors: string[]; description: string | null; price: string | null }): string {
  return [
    "You are a fashion editor. Judge this product using your general knowledge of fashion houses, their signature designs and recent trends. Be honest and conservative: answer true only when you are confident.",
    `Product: brand ${p.brand ?? "unknown"}; name ${p.title ?? "unknown"}; ${p.category ?? ""}${p.subcategory ? " / " + p.subcategory : ""}; colours ${p.colors.join(", ") || "unknown"}; price ${p.price ?? "unknown"}.`,
    p.description ? `Retailer description: ${p.description.slice(0, 600)}` : "",
    "iconic = a signature, widely recognised design of this house (e.g. Cartier Love / Juste un Clou, Chanel 2.55 or slingback, Hermès Birkin/Kelly, Rene Caovilla Cleo, Louboutin So Kate, Van Cleef Alhambra). A generic piece from a luxury brand is NOT iconic.",
    "timeless = will look current for many years. onTrend = clearly fashionable in recent seasons (e.g. a specific silhouette or finish being widely worn). statusPiece = recognisable luxury that signals status.",
    "versatility = low (one kind of occasion), medium, high (day to evening, many outfits).",
    "note = ONE short factual sentence in English about why (empty if nothing notable). Never invent prices or facts.",
    'Respond with ONLY JSON: {"iconic": false, "timeless": false, "onTrend": false, "statusPiece": false, "versatility": "medium", "note": ""}',
  ].filter(Boolean).join("\n");
}

type Verdict = { verdict: "buy" | "maybe" | "skip"; confidence: "high" | "medium" | "low" };

/** Fashion value on top of the wardrobe-based verdict, deterministic:
 *  - never overrides a dress-preference conflict or a real (certain) duplicate;
 *  - an iconic piece, or a timeless status piece, that doesn't duplicate anything and has
 *    something to be worn with (or fills a gap) is worth buying;
 *  - a piece that is on trend and versatile, not a duplicate, moves from "maybe" to "buy" when it
 *    pairs with the wardrobe. */
export function applyFashionSignals(
  base: Verdict,
  f: FashionSignals | null | undefined,
  ctx: { dressViolation: boolean; duplicate: { verdict: "certain" | "maybe" } | null; pairsWithCount: number; wardrobeGap: boolean },
): Verdict {
  if (!f || ctx.dressViolation || ctx.duplicate?.verdict === "certain" || base.verdict === "buy") return base;
  const wearable = ctx.pairsWithCount >= 1 || ctx.wardrobeGap;
  if ((f.iconic || (f.timeless && f.statusPiece)) && wearable) {
    return { verdict: "buy", confidence: base.confidence === "low" ? "medium" : base.confidence };
  }
  if (f.onTrend && f.versatility !== "low" && !ctx.duplicate && ctx.pairsWithCount >= 2) {
    return { verdict: "buy", confidence: "medium" };
  }
  return base;
}

/** Facts lines for the stylist prompt. */
export function fashionFacts(f: FashionSignals | null | undefined): string[] {
  if (!f) return [];
  const bits = [
    f.iconic ? "an iconic, recognisable signature design of its house" : "",
    f.timeless ? "timeless" : "",
    f.onTrend ? "on trend right now (from general knowledge — may be out of date)" : "",
    f.statusPiece ? "a status / luxury signal" : "",
    `versatility ${f.versatility}`,
  ].filter(Boolean);
  return [`- Fashion value: ${bits.join(", ")}.${f.note ? ` ${f.note}` : ""} Use this in the reason when relevant (iconic, timeless, trend, how wearable it is).`];
}
