// Run with: bun test src/lib/purchase-context.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyPurchaseContext, priceContext, sameModelOwned, shadeDifference } from "./purchase-context";
import type { WardrobeItem } from "./aura-types";

const item = (o: Partial<WardrobeItem> & Record<string, unknown>) => ({ id: Math.random().toString(), category: "Bottoms", colors: [], ...o }) as unknown as WardrobeItem;

const wardrobe = [
  item({ brand: "VICTORIA BECKHAM", model: "Alina", subcategory: "Jeans", colors: ["Denim Wash", "Sky Blue"], price: 450, currency: "EUR" }),
  item({ brand: "VICTORIA BECKHAM", model: "Alina", subcategory: "Trousers", colors: ["Pure White"], price: 450, currency: "EUR" }),
  item({ brand: "Motivi", subcategory: "Jeans", colors: ["Denim Wash"], price: 99, currency: "EUR" }),
  item({ brand: "Zara", subcategory: "Jeans", colors: ["Denim Wash"], price: 39.95, currency: "EUR" }),
  item({ brand: "Levi's", subcategory: "Jeans", colors: ["Denim Wash"], price: 110, currency: "EUR" }),
];

test("reported case: Alina jeans — two Alina already owned", () => {
  const same = sameModelOwned({ brand: "Victoria Beckham", title: "Alina Stretch Jean In Worn Blue Wash", category: "Bottoms" }, wardrobe);
  assert.equal(same.length, 2);
  assert.equal(sameModelOwned({ brand: "Victoria Beckham", title: "Pleated Trouser", category: "Bottoms" }, wardrobe).length, 0);
});

test("price against what the person pays for the same type", () => {
  const jeans = (price: number) => item({ subcategory: "Jeans", price, currency: "EUR" });
  const cheapTrousers = Array.from({ length: 30 }, () => item({ subcategory: "Trousers", price: 40, currency: "EUR" }));
  // reported case: jeans usually ~170 €, several at 400–620 € → 400 € is the top of her range, not "more than usual"
  const w2 = [...cheapTrousers, ...[60, 90, 120, 150, 170, 175, 200, 380, 400, 450, 620].map(jeans)];
  const p = priceContext({ price: "400", currency: "EUR", category: "Bottoms", subcategory: "Jeans" }, w2)!;
  assert.equal(p.tier, "upper_range");
  assert.equal(p.usualEur, 175);
  // someone who never paid more than ~110 € for jeans: 455 € is beyond their habits
  const p2 = priceContext({ price: "390", currency: "GBP", category: "Bottoms", subcategory: "Jeans" }, [40, 60, 80, 99, 110].map(jeans))!;
  assert.equal(p2.tier, "above_usual");
  // same model already bought at 450 €: never "beyond their habits"
  const alina = [item({ brand: "VICTORIA BECKHAM", model: "Alina", subcategory: "Jeans", price: 450, currency: "EUR" })];
  assert.equal(priceContext({ price: "500", currency: "EUR", category: "Bottoms", subcategory: "Jeans" }, [40, 60, 80, 99, 110].map(jeans), alina)!.tier, "upper_range");
});

test("same model + expensive for this person → maybe, never an upgrade", () => {
  const p = priceContext({ price: "390", currency: "GBP", category: "Bottoms", subcategory: "Jeans" }, wardrobe);
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 2, price: p, wardrobeGap: false }).verdict, "maybe");
  assert.equal(applyPurchaseContext({ verdict: "skip", confidence: "high" }, { sameModelCount: 2, price: p, wardrobeGap: false }).verdict, "skip");
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 0, price: p, wardrobeGap: false }).verdict, "buy");
});

test("shade: a navy wash is darker than a sky-blue one", () => {
  assert.equal(shadeDifference(["Navy"], ["Sky Blue"]), "darker");
  assert.equal(shadeDifference(["Sky Blue"], ["Navy"]), "lighter");
  assert.equal(shadeDifference(["Denim Wash"], ["Denim Wash"]), null);
});
