// Run with: bun test src/lib/suit-pairs.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isSuitPair, keepSuitsTogether } from "./suit-pairs";

const blackJacket = { id: "bj", category: "Outerwear", subcategory: "Blazer", brand: "Patrizia Pepe", colors: ["Jet Black"] };
const blackTrousers = { id: "bt", category: "Bottoms", subcategory: "Trousers", brand: "Patrizia Pepe", colors: ["Jet Black"] };
const burgundyJacket = { id: "rj", category: "Outerwear", subcategory: "Blazer", brand: "Mango", colors: ["Burgundy"] };
const burgundyTrousers = { id: "rt", category: "Bottoms", subcategory: "Trousers", brand: "Mango", colors: ["Burgundy"] };
const jeans = { id: "jn", category: "Bottoms", subcategory: "Jeans", brand: "Zara", colors: ["Soft Black"] };
const shirt = { id: "sh", category: "Tops", subcategory: "Shirt", brand: "Zara", colors: ["White"] };
const all = [blackJacket, blackTrousers, burgundyJacket, burgundyTrousers, jeans, shirt];

test("same brand and colour, jacket and trousers: one suit", () => {
  assert.equal(isSuitPair(blackJacket, blackTrousers), true);
  assert.equal(isSuitPair(blackJacket, burgundyTrousers), false);
  assert.equal(isSuitPair(blackJacket, { ...jeans, brand: "Patrizia Pepe", colors: ["Jet Black"] }), false, "jeans are not suit trousers");
});

test("the black suit jacket with the burgundy suit trousers becomes the black suit", () => {
  assert.deepEqual(keepSuitsTogether(["bj", "sh", "rt"], all), ["bj", "sh", "bt"]);
});

test("when the jacket's own trousers are not available, the trousers' own jacket is used", () => {
  assert.deepEqual(keepSuitsTogether(["bj", "sh", "rt"], all, (it) => it.id !== "bt"), ["rj", "sh", "rt"]);
});

test("a suit jacket with jeans, or a look with no suit, is left alone", () => {
  assert.deepEqual(keepSuitsTogether(["bj", "sh", "jn"], all), ["bj", "sh", "jn"]);
  assert.deepEqual(keepSuitsTogether(["sh", "rt"], all), ["sh", "rt"]);
  assert.deepEqual(keepSuitsTogether(["bj", "sh", "bt"], all), ["bj", "sh", "bt"]);
});

test("with neither suit complete, the bottoms become ones that belong to no suit", () => {
  const plainTrousers = { id: "pt", category: "Bottoms", subcategory: "Trousers", brand: "Zara", colors: ["Jet Black"] };
  const pool = [...all, plainTrousers];
  assert.deepEqual(keepSuitsTogether(["bj", "sh", "rt"], pool, (it) => it.id !== "bt" && it.id !== "rj"), ["bj", "sh", "pt"]);
});
