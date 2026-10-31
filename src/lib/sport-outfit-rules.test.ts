// Run with: bun test src/lib/sport-outfit-rules.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isSportContext, isSportWearable, sportCoreRole } from "./sport-outfit-rules";

test("a pilates request is a workout", () => {
  assert.equal(isSportContext("cosa metto per pilates domani?"), true);
  assert.equal(isSportContext("cena con amiche"), false);
  assert.equal(isSportContext("qualcosa per stasera", "sport"), true);
});

test("sport clothes only: no velvet tracksuit, no blazer, no heels", () => {
  assert.equal(isSportWearable({ category: "Activewear", subcategory: "Training Leggings" }), true);
  assert.equal(isSportWearable({ category: "Bottoms", subcategory: "Joggers", material: ["Velvet"] }), false);
  assert.equal(isSportWearable({ category: "Bottoms", subcategory: "Joggers", material: ["Cotton"] }), true);
  assert.equal(isSportWearable({ category: "Bottoms", subcategory: "Joggers", formality: 3 }), false);
  assert.equal(isSportWearable({ category: "Outerwear", subcategory: "Blazer" }), false);
  assert.equal(isSportWearable({ category: "Shoes", subcategory: "Pumps" }), false);
  assert.equal(isSportWearable({ category: "Shoes", subcategory: "Sneakers" }), true);
  assert.equal(isSportWearable({ category: "Tops", subcategory: "Shirt", occasion: "Sport" }), true);
});

test("activewear completes an outfit by itself", () => {
  assert.equal(sportCoreRole({ category: "Activewear", subcategory: "Tracksuit" }), "full");
  assert.equal(sportCoreRole({ category: "Activewear", subcategory: "Training Leggings" }), "bottom");
  assert.equal(sportCoreRole({ category: "Activewear", subcategory: "Sports Bra" }), "top");
  assert.equal(sportCoreRole({ category: "Tops", subcategory: "T-Shirt" }), null);
});
