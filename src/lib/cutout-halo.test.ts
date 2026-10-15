import test from "node:test";
import assert from "node:assert/strict";
import { removeWhiteHalo } from "./cutout-cleanup";

const W = 40, H = 40;
function img(fill: (x: number, y: number) => [number, number, number, number]) {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a.set(fill(x, y), (y * W + x) * 4);
  return a;
}
const alpha = (a: Uint8ClampedArray, x: number, y: number) => a[(y * W + x) * 4 + 3];
const inside = (x: number, y: number, m: number) => x >= m && x < W - m && y >= m && y < H - m;

test("a black piece on an uncut white photo: the white box becomes transparent, the piece stays", () => {
  const a = img((x, y) => (inside(x, y, 10) ? [10, 10, 10, 255] : [252, 252, 252, 255]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 2, 2), 0);
  assert.equal(alpha(a, 20, 20), 255);
});

test("a black cutout with a 2-px white rim: the rim goes, the piece stays", () => {
  const a = img((x, y) => (inside(x, y, 10) ? [10, 10, 10, 255] : inside(x, y, 8) ? [245, 245, 245, 255] : [0, 0, 0, 0]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 8, 20), 0);
  assert.equal(alpha(a, 9, 20), 0);
  assert.equal(alpha(a, 10, 20), 255);
});

test("a white piece keeps its white edge", () => {
  const a = img((x, y) => (inside(x, y, 8) ? [248, 248, 248, 255] : [0, 0, 0, 0]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 8, 20), 255);
});
