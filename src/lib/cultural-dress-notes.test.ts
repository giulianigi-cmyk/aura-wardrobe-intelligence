// Run with: bun test src/lib/cultural-dress-notes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { culturalNoteFor, isItemAllowedByCulture, matchCulturalDressNotes } from "./cultural-dress-notes";
import { buildCapsule, type PoolItem, type Requirement } from "./trip-capsule.server";

test("countries are recognised from the destination search label and from hand-typed names", () => {
  assert.equal(culturalNoteFor("Dubai, Dubai, United Arab Emirates")?.country, "United Arab Emirates");
  assert.equal(culturalNoteFor("Marrakech, Marrakesh-Safi, Morocco")?.level, "conservative");
  assert.equal(culturalNoteFor("Riyadh, Riyadh Region, Saudi Arabia")?.level, "strict");
  assert.equal(culturalNoteFor("Marocco")?.country, "Morocco");
  assert.equal(culturalNoteFor("Il Cairo")?.country, "Egypt");
  assert.equal(culturalNoteFor("Città del Vaticano")?.country, "Vatican City");
  assert.equal(culturalNoteFor("Teheran, Iran")?.advisory, "head_covering");
});

test("whole-word matching: no false positives from substrings or ambiguous city names", () => {
  for (const name of ["Bucharest, Romania", "Romano di Lombardia, Italy", "Festival Hall, London", "Miranda, Spain", "Alexandria, Virginia, United States", "Paris, France", "Bali, Indonesia", "Tripoli, Arcadia, Greece"]) {
    assert.equal(culturalNoteFor(name), null, name);
  }
});

test("de-duplicated matches across a multi-stop trip", () => {
  const notes = matchCulturalDressNotes(["Dubai, United Arab Emirates", "Abu Dhabi, United Arab Emirates", "Rome, Italy", "Doha, Qatar"]);
  assert.deepEqual(notes.map((n) => n.country), ["United Arab Emirates", "Qatar"]);
});

const top = (o: object) => ({ category: "Tops", subcategory: "Blouse", sleeveLength: "Long Sleeve", ...o });

test("conservative: covered shoulders, no mini, no shorts", () => {
  assert.equal(isItemAllowedByCulture(top({}), "conservative"), true);
  assert.equal(isItemAllowedByCulture(top({ sleeveLength: "Short Sleeve" }), "conservative"), true);
  assert.equal(isItemAllowedByCulture(top({ sleeveLength: "Sleeveless" }), "conservative"), false);
  assert.equal(isItemAllowedByCulture(top({ subcategory: "Camisole", sleeveLength: null }), "conservative"), false);
  assert.equal(isItemAllowedByCulture(top({ styleTags: ["off-shoulder"] }), "conservative"), false);
  assert.equal(isItemAllowedByCulture({ category: "Bottoms", subcategory: "Skirt", length: "Mini" }, "conservative"), false);
  assert.equal(isItemAllowedByCulture({ category: "Bottoms", subcategory: "Skirt", length: "Midi" }, "conservative"), true);
  assert.equal(isItemAllowedByCulture({ category: "Bottoms", subcategory: "Shorts" }, "conservative"), false);
  assert.equal(isItemAllowedByCulture({ category: "Bottoms", subcategory: "Bermuda Shorts" }, "conservative"), true);
  assert.equal(isItemAllowedByCulture({ category: "Shoes", subcategory: "Sandals" }, "conservative"), true);
  // nothing known about the piece: never excluded on missing data
  assert.equal(isItemAllowedByCulture({ category: "Tops", subcategory: "Shirt" }, "conservative"), true);
});

test("strict: also arms, legs to the ankle and no tight fits", () => {
  assert.equal(isItemAllowedByCulture(top({ sleeveLength: "Short Sleeve" }), "strict"), false);
  assert.equal(isItemAllowedByCulture(top({ sleeveLength: "Three-Quarter Sleeve" }), "strict"), true);
  assert.equal(isItemAllowedByCulture({ category: "Dresses", subcategory: "Shift Dress", length: "Midi", sleeveLength: "Long Sleeve" }, "strict"), false);
  assert.equal(isItemAllowedByCulture({ category: "Dresses", subcategory: "Shift Dress", length: "Maxi", sleeveLength: "Long Sleeve" }, "strict"), true);
  assert.equal(isItemAllowedByCulture({ category: "Bottoms", subcategory: "Trousers", fit: "Slim" }, "strict"), false);
  assert.equal(isItemAllowedByCulture({ category: "Bottoms", subcategory: "Trousers", fit: "Wide" }, "strict"), true);
  assert.equal(isItemAllowedByCulture({ category: "Dresses", subcategory: "Bodycon Dress", length: "Maxi", sleeveLength: "Long Sleeve" }, "strict"), false);
});

function item(o: Partial<PoolItem> & { id: string }): PoolItem {
  return { category: "Tops", subcategory: null, colors: null, style: null, season: null, brand: null, material: null, locationId: null, formality: 2, dayEvening: "day", sleeveLength: null, ...o };
}

test("trip capsule: on an adapted day only compliant pieces are packed; without the choice nothing changes", () => {
  const pool: PoolItem[] = [
    item({ id: "tank", subcategory: "Tank Top", sleeveLength: "Sleeveless" }),
    item({ id: "blouse", subcategory: "Blouse", sleeveLength: "Long Sleeve" }),
    item({ id: "mini", category: "Bottoms", subcategory: "Skirt", length: "Mini" }),
    item({ id: "trousers", category: "Bottoms", subcategory: "Trousers" }),
    item({ id: "shoes", category: "Shoes", subcategory: "Flats" }),
  ];
  const adapted: Requirement = { activityId: "a1", date: "2026-11-02", daySegment: "day", dressCode: null, label: "Old town walk", culturalLevel: "conservative" };
  const capsule = buildCapsule(pool, [adapted], new Map([["2026-11-02", "Autumn"]]));
  assert.equal(capsule.has("tank"), false);
  assert.equal(capsule.has("mini"), false);
  assert.ok(capsule.has("blouse") || capsule.has("trousers"));

  // A wardrobe with ONLY non-compliant pieces still gets a capsule (never a day with nothing).
  const onlyBare = [item({ id: "tank2", subcategory: "Tank Top", sleeveLength: "Sleeveless" }), item({ id: "shoes2", category: "Shoes" })];
  assert.ok(buildCapsule(onlyBare, [adapted], new Map([["2026-11-02", "Autumn"]])).size > 0);
});
