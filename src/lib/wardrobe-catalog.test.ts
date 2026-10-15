import test from "node:test";
import assert from "node:assert/strict";
import { compactCatalogJson, CATALOG_MAX_ITEMS } from "./wardrobe-catalog";

test("empty fields are left out, real values and lastWornDaysAgo stay", () => {
  const json = compactCatalogJson([{ id: "a", category: "Tops", fit: "", colors: [], formality: null, lastWornDaysAgo: null, brand: "Zara" }]);
  assert.deepEqual(JSON.parse(json), [{ id: "a", category: "Tops", lastWornDaysAgo: null, brand: "Zara" }]);
});

test("a real wardrobe fits whole", () => {
  assert.ok(CATALOG_MAX_ITEMS >= 1000);
});
