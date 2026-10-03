// Run with: bun test src/lib/garment-details.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { detailsIn } from "./garment-details";

test("lining and sole materials are not details of the piece", () => {
  assert.deepEqual([...detailsIn("Slingback in vernice con cinturino posteriore. Fodera in camoscio, suola in cuoio")].sort(), ["patent", "slingback"]);
  assert.deepEqual([...detailsIn("Patent pump. Suede lining, leather sole")], ["patent"]);
});

test("a generic strap is not an ankle strap; the ankle wording is", () => {
  assert.equal(detailsIn("sandalo con cinturino sottile").has("ankleStrap"), false);
  assert.equal(detailsIn("sandalo con cinturino alla caviglia").has("ankleStrap"), true);
});

test("the upper's own material still counts", () => {
  assert.equal(detailsIn("Mocassini in camoscio, suola in gomma").has("suede"), true);
});
