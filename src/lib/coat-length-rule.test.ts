// Run with: bun test src/lib/coat-length-rule.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isFloorLength, midCoatOverFloorLength } from "./coat-length-rule";

const jumpsuit = { category: "Jumpsuits", subcategory: "Jumpsuit" };
const midCoat = { category: "Outerwear", subcategory: "Coat", length: "Mid" };
const longCoat = { category: "Outerwear", subcategory: "Coat", length: "Long" };

test("a knee-length coat never goes over a long jumpsuit, a maxi dress or a maxi skirt", () => {
  assert.equal(midCoatOverFloorLength([jumpsuit, midCoat]), true);
  assert.equal(midCoatOverFloorLength([{ category: "Dresses", subcategory: "Slip Dress", length: "Maxi" }, midCoat]), true);
  assert.equal(midCoatOverFloorLength([{ category: "Bottoms", subcategory: "Skirt", length: "Maxi" }, { category: "Outerwear", subcategory: "Trench Coat", length: "Mid" }]), true);
});

test("a long coat, a short jacket or a blazer are fine; so is a mid coat over shorter pieces", () => {
  assert.equal(midCoatOverFloorLength([jumpsuit, longCoat]), false);
  assert.equal(midCoatOverFloorLength([jumpsuit, { category: "Outerwear", subcategory: "Leather Jacket", length: "Short" }]), false);
  assert.equal(midCoatOverFloorLength([jumpsuit, { category: "Outerwear", subcategory: "Blazer", length: "Mid" }]), false);
  assert.equal(midCoatOverFloorLength([{ category: "Dresses", subcategory: "Slip Dress", length: "Midi" }, midCoat]), false);
  assert.equal(midCoatOverFloorLength([{ category: "Jumpsuits", subcategory: "Playsuit" }, midCoat]), false);
  assert.equal(isFloorLength({ category: "Bottoms", subcategory: "Wide-Leg Trousers" }), false);
});
