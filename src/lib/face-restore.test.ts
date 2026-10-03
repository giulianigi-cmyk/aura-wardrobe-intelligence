// Run with: bun test src/lib/face-restore.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { landmarkAlignmentError } from "./face-restore";

const face = (ox: number, oy: number, k = 1, mouthShift = 0) => ({
  rightEye: { x: ox, y: oy }, leftEye: { x: ox + 60 * k, y: oy },
  checks: [
    { x: ox + 30 * k, y: oy + 40 * k },               // nose tip
    { x: ox + 10 * k + mouthShift, y: oy + 70 * k },  // mouth corner
    { x: ox + 50 * k + mouthShift, y: oy + 70 * k },  // mouth corner
    { x: ox + 30 * k + mouthShift, y: oy + 110 * k }, // chin
  ],
});

test("same face moved and scaled: aligns (paste allowed)", () => {
  assert.ok(landmarkAlignmentError(face(100, 100), face(300, 250, 1.5)) < 1);
});

test("head turned / face shape changed: big error (paste refused)", () => {
  const err = landmarkAlignmentError(face(100, 100), face(100, 100, 1, 25));
  assert.ok(err > 60 * 0.18, String(err));
});
