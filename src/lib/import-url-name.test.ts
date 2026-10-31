// Run with: bun test src/lib/import-url-name.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { cleanProductName } from "./import-url.functions";

test("the product title becomes the model: no brand, no shop suffix", () => {
  assert.equal(cleanProductName("PANTALONI WIDE LEG | ZARA Italia", "ZARA"), "PANTALONI WIDE LEG");
  assert.equal(cleanProductName("Zara - Blazer doppiopetto", "ZARA"), "Blazer doppiopetto");
  assert.equal(cleanProductName("Re-Edition 2005 Re-Nylon bag – Prada", "Prada"), "Re-Edition 2005 Re-Nylon bag");
  assert.equal(cleanProductName("ZARA", "ZARA"), null);
  assert.equal(cleanProductName(null, "ZARA"), null);
});
