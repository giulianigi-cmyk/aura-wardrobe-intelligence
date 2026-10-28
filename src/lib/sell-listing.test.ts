// Run with: bun test src/lib/sell-listing.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildListing, logsWear, sellReason, suggestedPrice } from "./sell-listing";

const now = Date.parse("2027-04-10T10:00:00Z");

test("a winter piece left on the hanger a whole winter is suggested; one added mid-winter is not", () => {
  const coat = { id: "c", category: "Outerwear", season: "Winter", created_at: "2026-11-01T00:00:00Z", last_worn: null };
  assert.equal(sellReason(coat, now), "seasonMissed");
  assert.equal(sellReason({ ...coat, last_worn: "2027-01-15" }, now), null);
  assert.equal(sellReason({ ...coat, created_at: "2027-01-05T00:00:00Z" }, now), null);
});

test("an autumn-winter piece needs both seasons missed", () => {
  const knit = { id: "k", category: "Tops", season: "Autumn, Winter", created_at: "2026-08-01T00:00:00Z", last_worn: null };
  assert.equal(sellReason(knit, now), "seasonMissed");
  assert.equal(sellReason({ ...knit, last_worn: "2026-10-20" }, now), null);
});

test("an all-season piece after 6 months, an occasion piece after 2 years", () => {
  const tee = { id: "t", category: "Tops", season: "All Seasons", created_at: "2026-07-01T00:00:00Z", last_worn: "2026-09-01" };
  assert.equal(sellReason(tee, now), "sixMonths");
  assert.equal(sellReason({ ...tee, last_worn: "2027-03-01" }, now), null);
  const gown = { id: "g", category: "Dresses", season: "All Seasons", formality: 5, created_at: "2026-07-01T00:00:00Z", last_worn: null };
  assert.equal(sellReason(gown, now), null);
  assert.equal(sellReason(gown, Date.parse("2028-08-01T00:00:00Z")), "twoYears");
});

test("never a piece on loan, archived or underwear", () => {
  const base = { id: "x", category: "Tops", season: "All Seasons", created_at: "2025-01-01T00:00:00Z", last_worn: null };
  assert.equal(sellReason({ ...base, active_loan_id: "l" }, now), null);
  assert.equal(sellReason({ ...base, archived: true }, now), null);
  assert.equal(sellReason({ ...base, category: "Underwear" }, now), null);
});

test("only people who log what they wear", () => {
  const recent = (i: number) => ({ id: `${i}`, last_worn: "2027-04-01" });
  assert.equal(logsWear([1, 2, 3, 4].map(recent), now), false);
  assert.equal(logsWear([1, 2, 3, 4, 5].map(recent), now), true);
});

test("price follows condition within the resale range", () => {
  assert.equal(suggestedPrice(40, 80, "newWithTags"), 80);
  assert.equal(suggestedPrice(40, 80, "veryGood"), 60);
  assert.equal(suggestedPrice(40, 80, "fair"), 34);
  assert.equal(suggestedPrice(300, 500, "veryGood"), 400);
  assert.equal(suggestedPrice(null, 80, "good"), null);
});

test("listing title stays within 60 characters", () => {
  const text = { conditionLabels: { newWithTags: "Nuovo con cartellino", newNoTags: "Nuovo senza cartellino", veryGood: "Ottime condizioni", good: "Buone condizioni", fair: "Discrete condizioni" }, size: "Taglia", materials: "Materiali", color: "Colore", condition: "Condizioni", brand: "Brand" };
  const l = buildListing({ brand: "Miu Miu", garment: "Pochette nera", colorLabel: "Nero", size: "U", materials: ["Pelle"], condition: "veryGood" }, text);
  assert.equal(l.title, "Miu Miu Pochette nera · Taglia U");
  assert.ok(l.description.includes("Condizioni: Ottime condizioni"));
  const long = buildListing({ brand: "Christian Louboutin", garment: "Décolleté in vernice nude con tacco a spillo molto alto", size: "38", materials: [], condition: "good" }, text);
  assert.ok(long.title.length <= 60);
});
