// Run with: bun test src/lib/photo-framing.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { clampFraming, fittedSize, FIT_FRAMING } from "./photo-framing";

test("a tall full-length photo is fitted whole (height fills the frame, nothing cut)", () => {
  const s = fittedSize(9 / 16);
  assert.equal(s.h, 1);
  assert.ok(s.w < 1);
});

test("a wide photo is fitted whole (width fills the frame)", () => {
  const s = fittedSize(4 / 3);
  assert.equal(s.w, 1);
  assert.ok(s.h < 1);
});

test("at fit zoom the photo can't be moved off centre", () => {
  assert.deepEqual(clampFraming({ scale: 1, x: 0.3, y: -0.4 }, 9 / 16), FIT_FRAMING);
});

test("zoomed in, it moves only until its edge meets the frame", () => {
  const f = clampFraming({ scale: 2, x: 5, y: -5 }, 4 / 5);
  assert.deepEqual(f, { scale: 2, x: 0.5, y: -0.5 });
});

test("zoom is limited and invalid values fall back safely", () => {
  assert.equal(clampFraming({ scale: 99, x: 0, y: 0 }, 1).scale, 4);
  assert.equal(clampFraming({ scale: 0.2, x: 0, y: 0 }, 1).scale, 1);
  assert.deepEqual(clampFraming({ scale: Number.NaN, x: Number.NaN, y: 0 }, 1), FIT_FRAMING);
});
