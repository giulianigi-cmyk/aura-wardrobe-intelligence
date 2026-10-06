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

test("restore decision: same pose with drifted mouth/jaw → restored; turned head → refused", async () => {
  const { canRestoreFace } = await import("./face-restore");
  // Chained try-on drift: mouth corners moved a little, chin a lot — the face to repair.
  const drifted = face(100, 100);
  drifted.checks[1] = { x: 110 + 10, y: 170 + 6 };
  drifted.checks[2] = { x: 150 + 8, y: 170 + 6 };
  drifted.checks[3] = { x: 130, y: 210 + 25 };
  assert.deepEqual(canRestoreFace(face(100, 100), drifted), { ok: true });
  // Head turned: the nose tip is far off the eye line.
  const turned = face(100, 100);
  turned.checks[0] = { x: 130 + 18, y: 140 };
  assert.deepEqual(canRestoreFace(face(100, 100), turned), { ok: false, reason: "pose" });
  // Mouth moved further than the inner-face paste can hide.
  assert.deepEqual(canRestoreFace(face(100, 100), face(100, 100, 1, 25)), { ok: false, reason: "mouth" });
});
