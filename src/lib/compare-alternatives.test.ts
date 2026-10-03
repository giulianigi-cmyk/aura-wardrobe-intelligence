// Run with: bun test src/lib/compare-alternatives.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { alternativeGroups, type CompareCandidate } from "./compare-alternatives";

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
