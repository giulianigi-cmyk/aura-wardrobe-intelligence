// Run with: bun test src/lib/compare-alternatives.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { alternativeGroups, sameProduct, compareRanking, type CompareCandidate } from "./compare-alternatives";

const c = (o: Partial<CompareCandidate>): CompareCandidate => ({
  category: "Shoes", subcategory: "Pumps", colors: ["Jet Black"], novelDetails: [], wardrobeGap: false, differences: [], duplicate: false, pairsWithCount: 5, ...o,
});

test("reported case: Cleo sandals, Iriza patent pump, Miss Z patent slingback", () => {
  const items = [
    c({ subcategory: "Sandals", colors: ["Off White"], novelDetails: [], differences: ["satin", "embellished"] }), // Cleo
    c({ differences: ["patent"] }),                                                                               // Iriza: patent version of the owned black pump
    c({ novelDetails: ["slingback"], differences: ["slingback", "patent"] }),                                     // Miss Z: no slingback owned
  ];
  const groups = alternativeGroups(items);
  assert.deepEqual(groups, [{ preferred: 2, others: [1] }]); // one or the other: the slingback
});

test("different colours or kinds are not alternatives", () => {
  assert.deepEqual(alternativeGroups([c({}), c({ colors: ["Cherry Red"] })]), []);
  assert.deepEqual(alternativeGroups([c({}), c({ subcategory: "Loafers" })]), []);
});

test("a piece that fills a gap beats one that duplicates what's owned", () => {
  assert.deepEqual(alternativeGroups([c({ duplicate: true }), c({ wardrobeGap: true })]), [{ preferred: 1, others: [0] }]);
});

test("reported ranking: Cleo (iconic, unlike anything owned) before Miss Z, Iriza last", () => {
  const f = (o: object) => ({ iconic: false, timeless: true, onTrend: false, statusPiece: true, versatility: "medium" as const, ...o });
  const items = [
    { ...c({ novelDetails: ["slingback"], differences: ["slingback", "patent", "suede", "ankle strap"] }), fashion: f({}), similarOwned: false }, // Miss Z
    { ...c({ subcategory: "Sandals", colors: ["Off White"], differences: ["satin", "embellished"] }), fashion: f({ iconic: true }), similarOwned: false }, // Cleo
    { ...c({ differences: ["patent"] }), fashion: f({}), similarOwned: false }, // Iriza
  ];
  const groups = alternativeGroups(items);
  assert.deepEqual(groups, [{ preferred: 0, others: [2] }]);
  assert.deepEqual(compareRanking(items, [4, 4, 3], groups), [1, 0, 2]);
});

test("tier always wins; the preferred alternative stays ahead of the one it replaces", () => {
  const items = [
    { ...c({ wardrobeGap: true }), fashion: null, similarOwned: false },
    { ...c({ subcategory: "Sandals" }), fashion: { iconic: true, timeless: true, onTrend: true, statusPiece: true, versatility: "high" as const }, similarOwned: false },
  ];
  assert.deepEqual(compareRanking(items, [4, 3], []), [0, 1]);
  const alts = [
    { ...c({ novelDetails: ["slingback"] }), fashion: null, similarOwned: false },
    { ...c({}), fashion: { iconic: true, timeless: true, onTrend: false, statusPiece: true, versatility: "high" as const }, similarOwned: false },
  ];
  const g = [{ preferred: 0, others: [1] }];
  assert.deepEqual(compareRanking(alts, [3, 3], g), [0, 1]);
});

test("the same product on two sites: recognised, and the cheaper one is preferred", () => {
  const base = { category: "Shoes", subcategory: "Sandals", colors: ["Sky Blue"], novelDetails: [], wardrobeGap: false, differences: [], duplicate: false, pairsWithCount: 10 };
  const official = { ...base, brand: "RENE' CAOVILLA", title: "Sandali", priceEur: 1080, novelDetails: ["embellished"] };
  const outlet = { ...base, brand: "Rene Caovilla", title: "Sandalo Ellabrita Azzurro Con Cristalli", priceEur: 510 };
  assert.ok(sameProduct(official, outlet));
  const groups = alternativeGroups([official, outlet]);
  assert.deepEqual(groups, [{ preferred: 1, others: [0], identical: true }]); // cheaper wins, whatever else differs
  // Two different models of the same brand and colour are alternatives, not the same product.
  const cleo = { ...base, brand: "Rene Caovilla", title: "Sandalo Cleo", priceEur: 900 };
  assert.ok(!sameProduct(outlet, cleo));
  assert.equal(alternativeGroups([outlet, cleo])[0].identical, undefined);
  // Different brands are never the same product.
  assert.ok(!sameProduct(outlet, { ...base, brand: "Aquazzura", title: "Sandali", priceEur: 700 }));
});
