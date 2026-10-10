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

test("a top-handle bag whose analysis says it has a crossbody strap covers 'crossbody'", () => {
  const owned = [{ id: "coco", category: "Bags", subcategory: "Top Handle Bag", colors: ["Burgundy"], details: ["handheld", "crossbody"] }];
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Burgundy"] }, owned)?.id, "coco");
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Burgundy"] }, [{ ...owned[0], details: ["handheld"] }]), null);
});

test("knit dress in black or dark grey: covered by a wool dress wearable this season (reported case)", () => {
  const dresses = [
    { id: "wool", category: "Dresses", subcategory: "Wrap Dress", colors: ["Jet Black"], material: ["Wool"], season: "Autumn, Winter" },
    { id: "summer", category: "Dresses", subcategory: "Sweater Dress", colors: ["Jet Black"], material: ["Cotton"], season: "Summer" },
  ];
  assert.equal(ownedEquivalent({ category: "Dresses", subcategory: "Sweater Dress", colors: ["Charcoal"] }, dresses, { season: "Autumn" })?.id, "wool");
  // in winter a summer-only black dress does not count, so a black winter dress is a real gap
  assert.equal(ownedEquivalent({ category: "Dresses", subcategory: "Sweater Dress", colors: ["Jet Black"] }, dresses.slice(1), { season: "Winter" }), null);
  assert.equal(ownedEquivalent({ category: "Dresses", subcategory: "Sweater Dress", colors: ["Jet Black"] }, dresses.slice(1), { season: "Summer" })?.id, "summer");
});
