// Run with: bun test src/lib/color-naming.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { nearestPaletteColorPerceptual } from "./color-naming";

test("a dark bottle green is named as a green, not Navy (reported case #0A3831)", () => {
  const c = nearestPaletteColorPerceptual("#0A3831");
  assert.equal(c.family, "Greens", c.name);
});

test("clear cases keep their obvious names", () => {
  assert.equal(nearestPaletteColorPerceptual("#0A1F44").name, "Navy");
  assert.equal(nearestPaletteColorPerceptual("#0A0A0A").family, "Blacks & Greys");
  assert.equal(nearestPaletteColorPerceptual("#FFFFFF").family, "Whites");
  assert.equal(nearestPaletteColorPerceptual("#D2042D").family, "Reds");
});
