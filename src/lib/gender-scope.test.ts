// Run with: bun test src/lib/gender-scope.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { suggestableForGender, suggestableTypes } from "./gender-scope";
import { SUBCATEGORY_OPTIONS } from "./wardrobe-options";

test("a man is never proposed dresses, skirts or handbags; no gender keeps everything", () => {
  assert.equal(suggestableForGender("Man", "Dresses", "Sweater Dress"), false);
  assert.equal(suggestableForGender("Man", "Bottoms", "Skirt"), false);
  assert.equal(suggestableForGender("Man", "Bags", "Clutch"), false);
  assert.equal(suggestableForGender("Man", "Bags", "Backpack"), true);
  assert.equal(suggestableForGender(null, "Dresses", "Slip Dress"), true);
  assert.equal(suggestableForGender("Prefer not to say", "Bottoms", "Skirt"), true);
  const men = suggestableTypes("Man", SUBCATEGORY_OPTIONS);
  assert.equal(men.Dresses, undefined);
  assert.ok(men.Bottoms.includes("Jeans") && !men.Bottoms.includes("Skirt"));
});
