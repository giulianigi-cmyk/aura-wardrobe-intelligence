import test from "node:test";
import assert from "node:assert/strict";
import { alphaChangedShare, NOTHING_REMOVED_SHARE } from "./cutout-quality";

const buf = (alphas: number[]) => {
  const a = new Uint8ClampedArray(alphas.length * 4);
  alphas.forEach((v, i) => { a[i * 4 + 3] = v; });
  return a;
};

test("a cutout run again on the same cutout changes nothing: remove.bg is needed", () => {
  const before = buf(Array.from({ length: 1000 }, (_, i) => (i < 400 ? 0 : 255)));
  const after = buf(Array.from({ length: 1000 }, (_, i) => (i < 400 ? 0 : i === 999 ? 120 : 255)));
  assert.ok(alphaChangedShare(before, after) < NOTHING_REMOVED_SHARE);
});

test("a cutout that clears the background of an opaque photo is a real change", () => {
  const before = buf(Array.from({ length: 1000 }, () => 255));
  const after = buf(Array.from({ length: 1000 }, (_, i) => (i < 400 ? 0 : 255)));
  assert.equal(alphaChangedShare(before, after), 0.4);
});
