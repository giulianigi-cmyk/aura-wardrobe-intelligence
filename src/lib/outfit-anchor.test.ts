// Run with: bun test src/lib/outfit-anchor.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { ensureAnchor } from "./outfit-anchor";

const cats: Record<string, string> = {
  skirt: "Bottoms", jeans: "Bottoms", dress: "Dresses", dress2: "Dresses", top: "Tops", shoes: "Shoes", bag: "Bags", coat: "Outerwear",
};
const catOf = (id: string) => cats[id];

test("no anchor: outfit unchanged", () => {
  assert.deepEqual(ensureAnchor(["top", "jeans", "shoes"], null, catOf), ["top", "jeans", "shoes"]);
});

test("anchor already in the outfit is kept (moved first)", () => {
  assert.deepEqual(ensureAnchor(["top", "skirt", "shoes"], "skirt", catOf), ["skirt", "top", "shoes"]);
});

test("a dropped skirt is put back, replacing the other bottom only", () => {
  assert.deepEqual(ensureAnchor(["top", "jeans", "shoes", "bag"], "skirt", catOf), ["skirt", "top", "shoes", "bag"]);
});

test("a dropped dress is put back, replacing top, bottom and the other dress", () => {
  assert.deepEqual(ensureAnchor(["top", "jeans", "shoes", "bag"], "dress", catOf), ["dress", "shoes", "bag"]);
  assert.deepEqual(ensureAnchor(["dress2", "shoes", "coat"], "dress", catOf), ["dress", "shoes", "coat"]);
});

test("a top anchor replaces a dress (top + bottom can't sit on a dress)", () => {
  assert.deepEqual(ensureAnchor(["dress", "shoes"], "top", catOf), ["top", "shoes"]);
});

test("unknown category: anchor is added without removing anything", () => {
  assert.deepEqual(ensureAnchor(["top", "jeans"], "mystery", catOf), ["mystery", "top", "jeans"]);
});
