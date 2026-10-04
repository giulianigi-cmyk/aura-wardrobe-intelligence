// Run with: bun test src/lib/dress-preferences.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { dressPreferenceConflicts } from "./dress-preferences";

test("purchase advisor: a piece is checked against the person's general 'never' rules, each one named", () => {
  const tee = { category: "Tops", subcategory: "T-Shirt", sleeveLength: "Short Sleeve" };
  assert.deepEqual(dressPreferenceConflicts(tee, { min_sleeve_length: "three-quarter" }), ["min_sleeve_length"]);
  assert.deepEqual(dressPreferenceConflicts({ ...tee, sleeveLength: "Long Sleeve" }, { min_sleeve_length: "three-quarter" }), []);
  assert.deepEqual(dressPreferenceConflicts(tee, { min_sleeve_length: "none" }), []);
  // Shoes and bags have no sleeves.
  assert.deepEqual(dressPreferenceConflicts({ category: "Shoes", subcategory: "Pumps" }, { min_sleeve_length: "long" }), []);
  assert.deepEqual(dressPreferenceConflicts({ category: "Tops", subcategory: "Blouse", text: "Blusa in tulle trasparente" }, { avoid_sheer: true }), ["avoid_sheer"]);
  assert.deepEqual(dressPreferenceConflicts({ category: "Dresses", subcategory: "Evening Dress", text: "Abito con scollatura profonda" }, { avoid_low_neckline: true }), ["avoid_low_neckline"]);
  assert.deepEqual(dressPreferenceConflicts({ category: "Shoes", subcategory: "Pumps", heelHeight: "High" }, { max_heel_height: "Mid" }), ["max_heel_height"]);
  assert.deepEqual(dressPreferenceConflicts({ category: "Dresses", subcategory: "Slip Dress", length: "Mini" }, { min_skirt_length: "knee" }), ["min_skirt_length"]);
  assert.deepEqual(dressPreferenceConflicts(tee, {}), []);
  assert.deepEqual(dressPreferenceConflicts(tee, null), []);
});
