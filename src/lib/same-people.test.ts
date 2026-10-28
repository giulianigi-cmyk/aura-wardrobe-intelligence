// Run with: bun test src/lib/same-people.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { earlierSameSeries, placeKey, repeatedMainPieces, sameLookAs, seenMainPieces, seriesKey, type EventLook } from "./same-people";

const cats: Record<string, string> = { blazer: "Outerwear", shirt: "Tops", dress: "Dresses", jeans: "Bottoms", shoes: "Shoes", bag: "Bags" };
const catOf = (id: string) => cats[id];

test("the same repeating event gets the same key, dates and numbers aside", () => {
  assert.equal(seriesKey("Riunione del lunedì 14/10"), "riunione del lunedi");
  assert.equal(seriesKey("Riunione del Lunedì #3"), "riunione del lunedi");
  assert.equal(seriesKey("Cena giovedì 21:00"), "cena giovedi");
  assert.equal(seriesKey("12/10"), null);
  assert.equal(seriesKey(null), null);
});

const looks: EventLook[] = [
  { eventId: "a", date: "2026-10-12", title: "Riunione del lunedì", itemIds: ["blazer", "jeans", "shoes"] },
  { eventId: "b", date: "2026-10-05", title: "Riunione del lunedì 05/10", itemIds: ["shirt", "jeans", "bag"] },
  { eventId: "c", date: "2026-08-03", title: "Riunione del lunedì", itemIds: ["dress"] },
  { eventId: "d", date: "2026-10-15", title: "Cena con Anna", itemIds: ["dress"] },
];

test("earlier occurrences: same series, before the date, within the weeks, most recent first", () => {
  const earlier = earlierSameSeries({ eventId: "x", title: "Riunione del lunedì 19/10", date: "2026-10-19" }, looks);
  assert.deepEqual(earlier.map((l) => l.eventId), ["a", "b"]);
  assert.deepEqual(earlierSameSeries({ eventId: "x", title: "Aperitivo", date: "2026-10-19" }, looks), []);
});

test("only main pieces are pointed out, with the most recent time they were seen", () => {
  const earlier = earlierSameSeries({ eventId: "x", title: "Riunione del lunedì", date: "2026-10-19" }, looks);
  const rep = repeatedMainPieces(["blazer", "jeans", "shoes", "dress"], earlier, catOf);
  assert.deepEqual(rep.map((r) => [r.itemId, r.look.eventId]), [["blazer", "a"]]);
  assert.equal(sameLookAs(["shoes", "blazer", "jeans"], earlier)?.eventId, "a");
  assert.equal(sameLookAs(["blazer", "jeans"], earlier), null);
  assert.deepEqual(seenMainPieces(earlier, catOf).sort(), ["blazer", "shirt"]);
});

test("the same place counts for a dinner, lunch, brunch or evening out, not for work", () => {
  assert.equal(placeKey("Ristorante Da Mario, Via Roma 1"), placeKey("ristorante da mario via roma 1"));
  assert.equal(placeKey("  "), null);
  const placed: EventLook[] = [
    { eventId: "p1", date: "2026-10-10", title: "Cena con Luca", location: "Ristorante Da Mario", itemIds: ["dress"] },
    { eventId: "p2", date: "2026-08-20", title: "Pranzo con Sara", location: "Ristorante Da Mario", itemIds: ["blazer"] },
    { eventId: "p3", date: "2026-10-12", title: "Riunione del lunedì", location: "Ufficio", itemIds: ["shirt"] },
    { eventId: "p4", date: "2026-10-13", title: "Call clienti", location: "Ufficio", itemIds: ["blazer"] },
  ];
  const dinner = earlierSameSeries({ eventId: "x", title: "Brunch compleanno Anna", location: "ristorante da mario", date: "2026-10-19" }, placed);
  assert.deepEqual(dinner.map((l) => [l.eventId, l.match]), [["p1", "place"]]);
  // At the office the place does not count; only the same repeating meeting does.
  const office = earlierSameSeries({ eventId: "y", title: "Riunione del lunedì", location: "Ufficio", date: "2026-10-19" }, placed);
  assert.deepEqual(office.map((l) => [l.eventId, l.match]), [["p3", "event"]]);
});
