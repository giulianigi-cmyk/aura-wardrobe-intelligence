import test from "node:test";
import assert from "node:assert/strict";
import { isWarmOuter, isWarmAndRainReady, isDressyOuter, warmthTier, coatOverBareArms } from "./warm-outer";

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

test("a wool coat over a T-shirt alone is rejected; with long sleeves or a knit it is fine", () => {
  const coat = { category: "Outerwear", subcategory: "Coat", material: ["Wool", "Cashmere"] };
  const tee = { category: "Tops", subcategory: "T-Shirt", sleeveLength: "Short Sleeve" };
  const jeans = { category: "Bottoms", subcategory: "Jeans" };
  assert.equal(coatOverBareArms([coat, tee, jeans]), true, "camel wool coat + white tee (reported)");
  assert.equal(coatOverBareArms([coat, { category: "Tops", subcategory: "Shirt", sleeveLength: "Long Sleeve" }, jeans]), false);
  assert.equal(coatOverBareArms([coat, tee, { category: "Tops", subcategory: "Cardigan", sleeveLength: "Long Sleeve" }, jeans]), false, "a knit over the tee");
  assert.equal(coatOverBareArms([coat, { category: "Tops", subcategory: "Sweater", sleeveLength: "Short Sleeve" }, jeans]), false, "a short-sleeve knit is still a knit");
  // a trench or a polyester "coat" is not a winter coat: a tee under it can be a mild-day look
  assert.equal(coatOverBareArms([{ category: "Outerwear", subcategory: "Trench Coat", material: ["Cotton"] }, tee, jeans]), false);
  assert.equal(coatOverBareArms([{ category: "Outerwear", subcategory: "Coat", material: ["Polyester"] }, tee, jeans]), false);
  assert.equal(coatOverBareArms([coat, jeans]), false, "no top to judge");
});
