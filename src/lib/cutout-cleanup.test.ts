// Run with: bun test src/lib/cutout-cleanup.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { cleanCutout, colorKeyCutout, estimateBackground, keptForegroundRatio, MIN_KEPT_FOREGROUND, type Rgb } from "./cutout-cleanup";

function img(w: number, h: number, fill: [number, number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) a.set(fill, p * 4);
  return a;
}
function rect(a: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, px: [number, number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a.set(px, (y * w + x) * 4);
}
const alpha = (a: Uint8ClampedArray, w: number, x: number, y: number) => a[(y * w + x) * 4 + 3];

test("background colour from a uniform photo border", () => {
  const w = 100, h = 100;
  const photo = img(w, h, [240, 238, 235, 255]);
  rect(photo, w, 30, 30, 70, 70, [90, 30, 40, 255]);
  const bg = estimateBackground(photo, w, h)!;
  assert.ok(bg && Math.abs(bg[0] - 240) < 3 && Math.abs(bg[2] - 235) < 3);
});

test("busy border: no background colour", () => {
  const w = 100, h = 100;
  const photo = img(w, h, [0, 0, 0, 255]);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if ((x + y) % 2) photo.set([255, 255, 255, 255], (y * w + x) * 4);
  assert.equal(estimateBackground(photo, w, h), null);
});

test("detached floor patch removed, garment kept", () => {
  const w = 100, h = 100;
  const cut = img(w, h, [0, 0, 0, 0]);
  rect(cut, w, 20, 10, 80, 80, [90, 30, 40, 255]); // garment
  rect(cut, w, 5, 90, 9, 94, [200, 200, 200, 255]); // small detached patch
  cleanCutout(cut, w, h, null);
  assert.equal(alpha(cut, w, 6, 91), 0);
  assert.equal(alpha(cut, w, 50, 50), 255);
});

test("pale semi-transparent shadow in the floor colour removed; solid same-colour garment kept", () => {
  const w = 100, h = 100;
  const bg: Rgb = [235, 235, 232];
  const cut = img(w, h, [0, 0, 0, 0]);
  rect(cut, w, 20, 10, 80, 70, [236, 236, 233, 255]); // white garment on a white floor: solid
  rect(cut, w, 20, 70, 80, 85, [230, 230, 228, 150]); // attached pale shadow under the hem
  cleanCutout(cut, w, h, bg);
  assert.equal(alpha(cut, w, 50, 40), 255);
  assert.equal(alpha(cut, w, 50, 78), 0);
});

test("a pair of similar pieces is kept whole", () => {
  const w = 100, h = 60;
  const cut = img(w, h, [0, 0, 0, 0]);
  rect(cut, w, 5, 10, 40, 50, [20, 20, 20, 255]);
  rect(cut, w, 60, 10, 92, 50, [20, 20, 20, 255]);
  cleanCutout(cut, w, h, null);
  assert.equal(alpha(cut, w, 20, 30), 255);
  assert.equal(alpha(cut, w, 75, 30), 255);
});

test("faint haze removed", () => {
  const w = 40, h = 40;
  const cut = img(w, h, [0, 0, 0, 0]);
  rect(cut, w, 10, 10, 30, 30, [50, 50, 50, 255]);
  rect(cut, w, 0, 0, 40, 5, [200, 200, 200, 20]);
  cleanCutout(cut, w, h, null);
  assert.equal(alpha(cut, w, 20, 2), 0);
  assert.equal(alpha(cut, w, 20, 20), 255);
});

// A navy sweater with a light motif, photographed on white, nearly filling the frame (its sleeves
// reach into the border band on the left and right).
function navySweaterPhoto(w: number, h: number) {
  const orig = img(w, h, [255, 255, 255, 255]);
  rect(orig, w, 2, 10, w - 2, 90, [20, 30, 70, 255]); // the sweater, almost edge to edge
  rect(orig, w, 40, 40, 60, 60, [240, 235, 220, 255]); // the cream motif in the middle
  return orig;
}

test("a garment touching the edge of a white product photo still leaves a trusted white background", () => {
  const w = 100, h = 100;
  assert.deepEqual(estimateBackground(navySweaterPhoto(w, h), w, h), [255, 255, 255]);
});

test("a cutout that erased the dark body and kept only the light motif is detected, and the colour cutout keeps it all", () => {
  const w = 100, h = 100;
  const orig = navySweaterPhoto(w, h);
  const bg = estimateBackground(orig, w, h)!;
  const broken = img(w, h, [0, 0, 0, 0]);
  rect(broken, w, 40, 40, 60, 60, [240, 235, 220, 255]); // only the motif survived
  assert.ok(keptForegroundRatio(orig, broken, w, h, bg)! < MIN_KEPT_FOREGROUND);
  const good = img(w, h, [0, 0, 0, 0]);
  rect(good, w, 2, 10, w - 2, 90, [20, 30, 70, 255]);
  assert.ok(keptForegroundRatio(orig, good, w, h, bg)! >= MIN_KEPT_FOREGROUND, "a correct cutout passes");

  const fixed = colorKeyCutout(orig, w, h, bg);
  assert.equal(alpha(fixed, w, 50, 3), 0, "the white above is background");
  assert.equal(alpha(fixed, w, 50, 96), 0, "the white below is background");
  assert.equal(alpha(fixed, w, 10, 50), 255, "the navy body stays");
  assert.equal(alpha(fixed, w, 50, 50), 255, "the cream motif, enclosed by the sweater, stays");
});
