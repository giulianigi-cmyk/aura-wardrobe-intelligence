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

test("a white shirt photographed on white, never cut out: nothing is erased", () => {
  // the shirt is a touch darker than the background but within the background tolerance
  const a = img((x, y) => (inside(x, y, 6) ? [236, 236, 234, 255] : [252, 252, 252, 255]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 20, 20), 255);
  assert.equal(alpha(a, 2, 2), 255, "the box stays rather than the shirt going");
});

test("a dark top with a wide white edge (a white collar band): the white is part of it and stays", () => {
  const a = img((x, y) => (inside(x, y, 14) ? [20, 20, 20, 255] : inside(x, y, 8) ? [250, 250, 250, 255] : [0, 0, 0, 0]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 8, 20), 255);
  assert.equal(alpha(a, 20, 20), 255);
});

test("a cream knit on a white photo, partly reachable from the border: left as it is", () => {
  // a grey outline only on the left: without the light-piece rule the flood would eat the right half
  const a = img((x, y) => (inside(x, y, 6) ? (x === 6 ? [120, 120, 120, 255] : [240, 236, 228, 255]) : [252, 252, 252, 255]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 30, 20), 255);
});

test("a navy sweater with a white bear motif (the Ralph Lauren case): navy and bear both stay", () => {
  const bear = (x: number, y: number) => x >= 16 && x < 24 && y >= 16 && y < 24;
  const navy: [number, number, number, number] = [20, 30, 70, 255];
  // uncut product photo on white
  const photo = img((x, y) => (bear(x, y) ? [250, 250, 250, 255] : inside(x, y, 8) ? navy : [252, 252, 252, 255]));
  removeWhiteHalo(photo, W, H);
  assert.equal(alpha(photo, 2, 2), 0, "background removed");
  assert.equal(alpha(photo, 10, 20), 255, "navy body kept");
  assert.equal(alpha(photo, 20, 20), 255, "white bear kept");
  // already cut out, with a white rim
  const cut = img((x, y) => (bear(x, y) ? [250, 250, 250, 255] : inside(x, y, 9) ? navy : inside(x, y, 8) ? [245, 245, 245, 255] : [0, 0, 0, 0]));
  removeWhiteHalo(cut, W, H);
  assert.equal(alpha(cut, 8, 20), 0, "white rim removed");
  assert.equal(alpha(cut, 12, 20), 255, "navy body kept");
  assert.equal(alpha(cut, 20, 20), 255, "white bear kept");
});

test("a navy blazer with a ragged light-grey fringe, 1-2 px deep: the fringe goes, the blazer stays", () => {
  // the blend of navy and the white/grey floor: light grey, not near-white, of uneven depth
  const navy: [number, number, number, number] = [25, 30, 60, 255];
  const a = img((x, y) => {
    if (!inside(x, y, 8)) return [0, 0, 0, 0];
    const depth = 1 + (y % 2); // 1 or 2 px of fringe along the left edge (the peel is 2 px at this size)
    if (x < 8 + depth) return [172, 174, 178, 255];
    return inside(x, y, 9) ? navy : [200, 200, 204, 255];
  });
  removeWhiteHalo(a, W, H);
  for (let y = 10; y < 30; y++) for (let x = 8; x < 8 + 1 + (y % 2); x++) assert.equal(alpha(a, x, y), 0, `fringe at ${x},${y}`);
  assert.equal(alpha(a, 20, 20), 255, "blazer body kept");
  assert.equal(alpha(a, 12, 20), 255, "blazer edge kept");
});

test("a dark piece with a white detail at its edge: the detail stays, the thin rim elsewhere goes", () => {
  // white rim of 1 px all round, plus a white patch 8 px deep on the left (a white sole, a collar)
  const a = img((x, y) => {
    if (!inside(x, y, 8)) return [0, 0, 0, 0];
    if (x < 16 && y >= 16 && y < 24) return [250, 250, 250, 255];
    if (!inside(x, y, 9)) return [248, 248, 248, 255];
    return [15, 15, 15, 255];
  });
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 8, 20), 255, "white detail kept");
  assert.equal(alpha(a, 12, 20), 255, "white detail kept");
  assert.equal(alpha(a, 20, 8), 0, "thin rim on the top edge removed");
  assert.equal(alpha(a, 31, 20), 0, "thin rim on the right edge removed");
});

test("a white shirt with a grey shadow fringe: the fringe goes, the shirt stays white", () => {
  const a = img((x, y) => (inside(x, y, 9) ? [246, 246, 244, 255] : inside(x, y, 8) ? [120, 120, 124, 255] : [0, 0, 0, 0]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 8, 20), 0);
  assert.equal(alpha(a, 9, 20), 255);
  assert.equal(alpha(a, 20, 20), 255);
});

test("half-transparent edge pixels tinted white take the piece's colour and keep their softness", () => {
  const a = img((x, y) => (inside(x, y, 9) ? [20, 25, 60, 255] : inside(x, y, 8) ? [230, 230, 232, 120] : [0, 0, 0, 0]));
  // keep the soft edge out of the peel: a real dark outline outside it
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y, 7) && !inside(x, y, 8)) a.set([20, 25, 60, 60], (y * W + x) * 4);
  removeWhiteHalo(a, W, H);
  const i = (20 * W + 8) * 4;
  assert.equal(a[i + 3], 120, "softness kept");
  assert.ok(a[i] < 60 && a[i + 2] < 100, `colour from the piece, got ${a[i]},${a[i + 1]},${a[i + 2]}`);
});

test("a red garment keeps its light pink highlights at the edge (coloured, not a grey fringe)", () => {
  const a = img((x, y) => (inside(x, y, 9) ? [170, 20, 30, 255] : inside(x, y, 8) ? [240, 170, 175, 255] : [0, 0, 0, 0]));
  removeWhiteHalo(a, W, H);
  assert.equal(alpha(a, 8, 20), 255);
});
