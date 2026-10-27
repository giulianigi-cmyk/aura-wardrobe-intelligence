// Run with: bun test src/lib/tall-boots-rule.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { clashesWithTallBoots, isTallBoot, violatesTallBootsRule } from "./tall-boots-rule";

const knee = { category: "Shoes", subcategory: "Knee Boots" };
const otk = { category: "Shoes", subcategory: "Over-the-Knee Boots" };
const ankle = { category: "Shoes", subcategory: "Ankle Boots" };

test("recognises knee and over-the-knee boots only", () => {
  assert.equal(isTallBoot(knee), true);
  assert.equal(isTallBoot(otk), true);
  assert.equal(isTallBoot(ankle), false);
  assert.equal(isTallBoot({ category: "Shoes", subcategory: "Boots" }), false);
});

test("rejects knee boots with regular tailored trousers (the real case)", () => {
  const trousers = { category: "Bottoms", subcategory: "Trousers", fit: "Regular", styleTags: ["Tailored", "Office"] };
  assert.equal(violatesTallBootsRule([trousers, knee]), true);
  assert.equal(violatesTallBootsRule([trousers, ankle]), false);
});

test("uses the leg shape when known", () => {
  assert.equal(clashesWithTallBoots({ category: "Bottoms", subcategory: "Jeans", fit: "Slim", legShape: "wide" }), true);
  assert.equal(clashesWithTallBoots({ category: "Bottoms", subcategory: "Jeans", fit: "Relaxed", legShape: "skinny" }), false);
  assert.equal(clashesWithTallBoots({ category: "Bottoms", subcategory: "Trousers", legShape: "tapered" }), false);
  assert.equal(clashesWithTallBoots({ category: "Jumpsuits", subcategory: "Jumpsuit", legShape: "flare" }), true);
  assert.equal(clashesWithTallBoots({ category: "Jumpsuits", subcategory: "Jumpsuit" }), false);
});

test("allows skirts, shorts, leggings and slim trousers", () => {
  assert.equal(violatesTallBootsRule([{ category: "Bottoms", subcategory: "Skirt", fit: "Relaxed" }, otk]), false);
  assert.equal(violatesTallBootsRule([{ category: "Bottoms", subcategory: "Shorts" }, otk]), false);
  assert.equal(violatesTallBootsRule([{ category: "Bottoms", subcategory: "Leggings", fit: "Regular" }, otk]), false);
  assert.equal(violatesTallBootsRule([{ category: "Bottoms", subcategory: "Jeans", fit: "Slim" }, knee]), false);
  assert.equal(violatesTallBootsRule([{ category: "Dresses", subcategory: "Shirt Dress" }, knee]), false);
});
