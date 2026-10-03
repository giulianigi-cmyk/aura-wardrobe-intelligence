// Run with: bun test src/lib/wardrobe-search.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { searchWardrobe, pieceLabel } from "./wardrobe-search";

const items = [
  { id: "balenciaga-dress", category: "Dresses", subcategory: "Slip Dress", colors: ["Jet Black"], brand: "Balenciaga", material: ["Viscose"] },
  { id: "balenciaga-bag", category: "Bags", subcategory: "Shoulder Bag", colors: ["Black"], brand: "Balenciaga", model: "Le Cagole" },
  { id: "frankie-skirt", category: "Bottoms", subcategory: "Skirt", colors: ["Black"], brand: "The Frankie Shop" },
  { id: "zara-skirt", category: "Bottoms", subcategory: "Skirt", colors: ["Powder Pink"], brand: "Zara" },
  { id: "zara-jeans", category: "Bottoms", subcategory: "Jeans", colors: ["Blue"], brand: "Zara" },
  { id: "cos-dress", category: "Dresses", subcategory: "Shirt Dress", colors: ["White"], brand: "COS", material: ["Cotton"] },
  { id: "toteme-shoes", category: "Shoes", subcategory: "Pumps", colors: ["Black"], brand: "Toteme", material: ["Leather"] },
];
const ids = (r: { matches: { id: string }[] }) => r.matches.map((m) => m.id);

test("brand + type in Italian finds the exact piece (the reported Balenciaga case)", () => {
  const r = searchWardrobe("Voglio mettere il vestito Balenciaga per la cena di sabato", items);
  assert.equal(r.isPieceQuery, true);
  assert.deepEqual(ids(r), ["balenciaga-dress"]);
  assert.equal(r.negated, false);
});

test("brand alone returns every piece of that brand (to choose from)", () => {
  assert.deepEqual(ids(searchWardrobe("cosa abbino al mio Balenciaga?", items)).sort(), ["balenciaga-bag", "balenciaga-dress"]);
});

test("type + colour, multilingual", () => {
  assert.deepEqual(ids(searchWardrobe("la gonna nera", items)), ["frankie-skirt"]);
  assert.deepEqual(ids(searchWardrobe("my pink skirt", items)), ["zara-skirt"]);
  assert.deepEqual(ids(searchWardrobe("mi falda rosa", items)), ["zara-skirt"]);
  assert.deepEqual(ids(searchWardrobe("ma robe blanche", items)), ["cos-dress"]);
  assert.deepEqual(ids(searchWardrobe("le décolleté in pelle", items)), ["toteme-shoes"]);
});

test("model name identifies a piece on its own", () => {
  assert.deepEqual(ids(searchWardrobe("posso usare la Le Cagole stasera?", items)), ["balenciaga-bag"]);
});

test("multi-word brand", () => {
  assert.deepEqual(ids(searchWardrobe("la gonna di The Frankie Shop", items)), ["frankie-skirt"]);
});

test("a type that isn't in the wardrobe: piece query with no match", () => {
  const r = searchWardrobe("hai una tuta intera?", items);
  assert.equal(r.isPieceQuery, true);
  assert.deepEqual(ids(r), []);
});

test("no piece mentioned: not a piece query", () => {
  const r = searchWardrobe("cosa mi metto per un aperitivo?", items);
  assert.equal(r.isPieceQuery, false);
  assert.equal(searchWardrobe("qualcosa di nero", items).isPieceQuery, false);
});

test("negation is detected", () => {
  assert.equal(searchWardrobe("non voglio il vestito Balenciaga", items).negated, true);
  assert.equal(searchWardrobe("senza la gonna nera", items).negated, true);
  assert.equal(searchWardrobe("voglio la gonna nera", items).negated, false);
});

test("words inside other words don't match", () => {
  // "cos" (brand) must not match inside "cosa"; "top" not inside "topo"
  assert.equal(searchWardrobe("cosa mi consigli?", items).isPieceQuery, false);
});

test("label identifies brand, colour and type", () => {
  assert.equal(pieceLabel(items[0]), "Balenciaga · Jet Black · Slip Dress");
});

import { isDayOnlyUsage, isEveningOnlyUsage } from "./stylist-chat.functions";

test("usage tags: day/work-only vs evening-only", () => {
  assert.equal(isDayOnlyUsage(["Everyday", "Work"], "day"), true);
  assert.equal(isDayOnlyUsage(["Everyday", "Work"], "both"), false);
  assert.equal(isDayOnlyUsage(["Everyday", "Evening"], null), false);
  assert.equal(isDayOnlyUsage([], null), false);
  assert.equal(isEveningOnlyUsage(["Cocktail", "Evening"], "evening"), true);
  assert.equal(isEveningOnlyUsage(["Cocktail", "Work"], "evening"), false);
  assert.equal(isEveningOnlyUsage(["Evening"], "both"), false);
});
