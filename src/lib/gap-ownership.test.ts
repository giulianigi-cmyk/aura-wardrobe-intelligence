// Run with: bun test src/lib/gap-ownership.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { ownedEquivalent } from "./gap-ownership";

const bags = [
  { id: "ysl", category: "Bags", subcategory: null, colors: ["Jet Black", "Gold"], brand: "Yves Saint Laurent" },
  { id: "speedy", category: "Bags", subcategory: "Top Handle Bag", colors: ["Chocolate", "Tan"], model: "Speedy Bandoulière 25" },
  { id: "valentino", category: "Bags", subcategory: "Shoulder Bag", colors: ["Cherry Red", "Gold"] },
  { id: "clutch", category: "Bags", subcategory: "Clutch", colors: ["Nude"] },
];

test("black crossbody: covered by the black YSL with no type on file (reported case)", () => {
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Black"] }, bags)?.id, "ysl");
});

test("shoulder bag covers crossbody; a top-handle bag with a strap does too", () => {
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Cherry Red"] }, bags)?.id, "valentino");
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Chocolate"] }, bags)?.id, "speedy");
});

test("a genuinely missing piece is still suggested", () => {
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Tote", colors: ["Camel"] }, bags.filter((b) => b.subcategory)), null);
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Navy"] }, bags), null); // navy ≠ black
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Clutch", colors: ["Jet Black"] }, bags.filter((b) => b.subcategory)), null);
});
