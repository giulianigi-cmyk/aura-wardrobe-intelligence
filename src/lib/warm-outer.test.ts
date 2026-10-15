import test from "node:test";
import assert from "node:assert/strict";
import { isWarmOuter, isWarmAndRainReady, isDressyOuter, warmthTier } from "./warm-outer";

test("a trench or a raincoat is never a warm layer, even when called a coat", () => {
  assert.equal(isWarmOuter({ subcategory: "Trench Coat", material: ["Cotton"] }), false);
  assert.equal(isWarmOuter({ subcategory: "Raincoat" }), false);
  assert.equal(isWarmOuter({ subcategory: "Trench", material: ["Wool"] }), false);
});

test("a wool coat, a puffer, a winter parka are warm; a puffer or parka is also made for the rain", () => {
  assert.equal(isWarmOuter({ subcategory: "Coat", material: ["Wool"] }), true);
  assert.equal(isWarmOuter({ subcategory: "Cappotto" }), true);
  assert.equal(isWarmOuter({ subcategory: "Long Puffer" }), true);
  assert.equal(isWarmOuter({ subcategory: "Parka", season: "Autumn, Winter" }), true);
  assert.equal(isWarmAndRainReady({ subcategory: "Puffer Jacket" }), true);
  assert.equal(isWarmAndRainReady({ subcategory: "Coat", material: ["Wool"] }), false);
  assert.equal(isWarmOuter({ subcategory: "Denim Jacket", material: ["Denim"] }), false);
});

test("a light polyester autumn parka is not warm", () => {
  assert.equal(isWarmOuter({ subcategory: "Parka", material: ["Polyester", "Synthetic"], season: "Autumn" }), false);
  assert.equal(isWarmOuter({ subcategory: "Parka", material: ["Polyester", "Down"], season: "Autumn" }), true);
});

test("a sporty parka or a puffer is not dressy; a wool coat is", () => {
  assert.equal(isDressyOuter({ subcategory: "Parka", formality: 2, styleTags: ["Streetwear", "Sporty"] }), false);
  assert.equal(isDressyOuter({ subcategory: "Puffer Jacket", formality: 3, styleTags: ["Tailored", "Office"] }), false);
  assert.equal(isDressyOuter({ subcategory: "Coat", formality: 4, style: ["Quiet Luxury", "Elegant"] }), true);
  assert.equal(isDressyOuter({ subcategory: "Coat", formality: 3, styleTags: ["Streetwear"] }), false);
});

test("a wool coat is warmer than a polyester faux-fur coat; a trench is not warm at all", () => {
  assert.equal(warmthTier({ subcategory: "Coat", material: ["Wool", "Cashmere"] }), 2);
  assert.equal(warmthTier({ subcategory: "Coat", material: ["Polyester", "Synthetic"] }), 1);
  assert.equal(warmthTier({ subcategory: "Trench Coat", material: ["Cotton"] }), 0);
});
