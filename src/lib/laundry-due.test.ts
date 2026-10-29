// Run with: bun test src/lib/laundry-due.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { laundryLoad, washRule, wearsAllowed, climateGuess } from "./laundry-due";

const today = "2026-10-29";

test("rules follow the table; outerwear, shoes, sport and accessories are not counted", () => {
  assert.deepEqual(washRule({ category: "Tops", subcategory: "T-Shirt" }), { warm: 1, cold: 2 });
  assert.deepEqual(washRule({ category: "Bottoms", subcategory: "Jeans" }), { warm: 3, cold: 5 });
  assert.deepEqual(washRule({ category: "Underwear", subcategory: "Bra" }), { warm: 2, cold: 3 });
  assert.deepEqual(washRule({ category: "Tops", subcategory: "Sweater", material: ["Wool"] }), { warm: 5, cold: 5 });
  assert.deepEqual(washRule({ category: "Tops", subcategory: "Sweater", material: ["Cotton"] }), { warm: 3, cold: 4 });
  for (const category of ["Outerwear", "Shoes", "Bags", "Accessories", "Activewear"]) assert.equal(washRule({ category }), null);
});

test("the temperature of each wear decides, blending between cold and warm", () => {
  const tee = { warm: 1, cold: 2 };
  assert.equal(wearsAllowed(tee, 30), 1);
  assert.equal(wearsAllowed(tee, 5), 2);
  assert.equal(wearsAllowed(tee, 19), 1.5);
  assert.equal(wearsAllowed(tee, null), 1.5);
});

test("a T-shirt: one hot day is enough, two cold days are needed", () => {
  const rule = { warm: 1, cold: 2 };
  assert.equal(laundryLoad({ rule, wears: [{ date: "2026-10-28", temp: 26 }], lastWash: null, lastCheck: null, today }).due, true);
  assert.equal(laundryLoad({ rule, wears: [{ date: "2026-10-28", temp: 10 }], lastWash: null, lastCheck: null, today }).due, false);
  assert.equal(laundryLoad({ rule, wears: [{ date: "2026-10-27", temp: 10 }, { date: "2026-10-28", temp: 11 }], lastWash: null, lastCheck: null, today }).due, true);
});

test("counted from the last wash, never further back than three weeks", () => {
  const rule = { warm: 3, cold: 5 };
  const wears = ["2026-10-01", "2026-10-20", "2026-10-22", "2026-10-25", "2026-10-26", "2026-10-28"].map((date) => ({ date, temp: 10 }));
  assert.equal(laundryLoad({ rule, wears, lastWash: null, lastCheck: null, today }).wears.length, 5);
  assert.equal(laundryLoad({ rule, wears, lastWash: null, lastCheck: null, today }).due, true);
  const afterWash = laundryLoad({ rule, wears, lastWash: "2026-10-22T18:00:00Z", lastCheck: null, today });
  assert.equal(afterWash.wears.length, 3);
  assert.equal(afterWash.due, false);
});

test("after «Ancora pulito» it waits for one more wear", () => {
  const rule = { warm: 1, cold: 1 };
  const wears = [{ date: "2026-10-27", temp: 20 }];
  assert.equal(laundryLoad({ rule, wears, lastWash: null, lastCheck: "2026-10-28T08:00:00Z", today }).due, false);
  assert.equal(laundryLoad({ rule, wears: [...wears, { date: "2026-10-29", temp: 20 }], lastWash: null, lastCheck: "2026-10-28T08:00:00Z", today }).due, true);
});

test("a guess from the month when the weather is unknown", () => {
  assert.equal(climateGuess("2026-07-10", 45), 27);
  assert.equal(climateGuess("2026-01-10", 45), 8);
  assert.equal(climateGuess("2026-01-10", -33), 27);
  assert.equal(climateGuess("2026-04-10", null), 18);
});
