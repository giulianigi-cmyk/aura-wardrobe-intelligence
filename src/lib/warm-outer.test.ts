import test from "node:test";
import assert from "node:assert/strict";
import { isWarmOuter, isWarmAndRainReady } from "./warm-outer";

test("a trench or a raincoat is never a warm layer, even when called a coat", () => {
  assert.equal(isWarmOuter({ subcategory: "Trench Coat", material: ["Cotton"] }), false);
  assert.equal(isWarmOuter({ subcategory: "Raincoat" }), false);
  assert.equal(isWarmOuter({ subcategory: "Trench", material: ["Wool"] }), false);
});

test("a wool coat, a puffer, a parka are warm; a puffer or parka is also made for the rain", () => {
  assert.equal(isWarmOuter({ subcategory: "Coat", material: ["Wool"] }), true);
  assert.equal(isWarmOuter({ subcategory: "Cappotto" }), true);
  assert.equal(isWarmOuter({ subcategory: "Long Puffer" }), true);
  assert.equal(isWarmAndRainReady({ subcategory: "Parka" }), true);
  assert.equal(isWarmAndRainReady({ subcategory: "Coat", material: ["Wool"] }), false);
  assert.equal(isWarmOuter({ subcategory: "Denim Jacket", material: ["Denim"] }), false);
});
