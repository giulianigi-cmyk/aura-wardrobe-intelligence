// Run with: bun test src/lib/first-steps.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { starterProgress } from "./first-steps";

test("starter set: counts per group, a dress counts as a bottom, accessories only in the total", () => {
  const p = starterProgress([
    { category: "Tops" }, { category: "Tops" }, { category: "Dresses" }, { category: "Shoes" },
    { category: "Accessories" }, { category: null },
  ]);
  assert.equal(p.total, 6);
  assert.deepEqual(p.groups.map((g) => [g.key, g.have, g.want]), [
    ["tops", 2, 3], ["bottoms", 1, 2], ["outerwear", 0, 1], ["shoes", 1, 2], ["bags", 0, 1],
  ]);
});
