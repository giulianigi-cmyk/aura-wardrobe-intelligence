// Run with: bun test src/lib/place-dress-code.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { detectPlaceContext } from "./place-dress-code";

test("a church asks for shoulders and knees, not full-length legs or loose fits", () => {
  const p = detectPlaceContext("Matrimonio in chiesa")!;
  assert.equal(p.id, "sacred_church");
  assert.ok(p.requirements.includes("cover_knees"));
  assert.ok(!p.requirements.includes("cover_legs"));
  assert.ok(!p.requirements.includes("avoid_tight"));
});

test("a mosque keeps the full rules", () => {
  const p = detectPlaceContext("Visita alla moschea blu")!;
  assert.equal(p.id, "sacred_religious");
  assert.ok(p.requirements.includes("cover_legs"));
});

test("the most specific phrase wins: a Hindu temple is not a generic temple", () => {
  assert.equal(detectPlaceContext("tempio induista a Bali")!.id, "sacred_religious");
  assert.equal(detectPlaceContext("visita al tempio")!.id, "sacred_temple");
  assert.equal(detectPlaceContext("Tempio ebraico")!.id, "sacred_church");
});
