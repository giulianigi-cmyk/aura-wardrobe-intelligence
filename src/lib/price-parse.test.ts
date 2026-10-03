// Run with: bun test src/lib/price-parse.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice } from "./price-parse";

test("thousands separators in every convention (reported: Cartier bracelet read as 6.85)", () => {
  assert.equal(parsePrice("6.850"), 6850);
  assert.equal(parsePrice("6.850 €"), 6850);
  assert.equal(parsePrice("€ 6.850,00"), 6850);
  assert.equal(parsePrice("$6,850"), 6850);
  assert.equal(parsePrice("6,850.00 USD"), 6850);
  assert.equal(parsePrice("6 850 €"), 6850);
  assert.equal(parsePrice("6 850 €"), 6850);
  assert.equal(parsePrice("CHF 6'850.–"), 6850);
  assert.equal(parsePrice("1.234.567"), 1234567);
  assert.equal(parsePrice("12,345,678"), 12345678);
});

test("decimals", () => {
  assert.equal(parsePrice("49,90"), 49.9);
  assert.equal(parsePrice("49.90"), 49.9);
  assert.equal(parsePrice("49.9"), 49.9);
  assert.equal(parsePrice("1.234,56"), 1234.56);
  assert.equal(parsePrice("1,234.56"), 1234.56);
  assert.equal(parsePrice("0.850"), 0.85);
  assert.equal(parsePrice("6850.00"), 6850);
  assert.equal(parsePrice("120"), 120);
  assert.equal(parsePrice(6850), 6850);
});

test("not a price", () => {
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("gratis"), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice("."), null);
});
