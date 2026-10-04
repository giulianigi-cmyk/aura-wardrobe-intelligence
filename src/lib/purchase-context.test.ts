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

test("price against the person's usual spend for the category", () => {
  const p = priceContext({ price: "390", currency: "GBP", category: "Bottoms" }, wardrobe)!;
  assert.equal(p.tier, "above_usual");
  assert.ok(p.priceEur > 440 && p.priceEur < 470, String(p.priceEur));
  assert.equal(p.usualEur, 110);
  const luxury = Array.from({ length: 4 }, () => item({ price: 500, currency: "EUR" }));
  assert.equal(priceContext({ price: "450", currency: "EUR", category: "Bottoms" }, luxury)!.tier, "usual");
});

test("same model + expensive for this person → maybe, never an upgrade", () => {
  const p = priceContext({ price: "390", currency: "GBP", category: "Bottoms" }, wardrobe);
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 2, price: p, wardrobeGap: false }).verdict, "maybe");
  assert.equal(applyPurchaseContext({ verdict: "skip", confidence: "high" }, { sameModelCount: 2, price: p, wardrobeGap: false }).verdict, "skip");
  assert.equal(applyPurchaseContext({ verdict: "buy", confidence: "high" }, { sameModelCount: 0, price: p, wardrobeGap: false }).verdict, "buy");
});

test("shade: a navy wash is darker than a sky-blue one", () => {
  assert.equal(shadeDifference(["Navy"], ["Sky Blue"]), "darker");
  assert.equal(shadeDifference(["Sky Blue"], ["Navy"]), "lighter");
  assert.equal(shadeDifference(["Denim Wash"], ["Denim Wash"]), null);
});
