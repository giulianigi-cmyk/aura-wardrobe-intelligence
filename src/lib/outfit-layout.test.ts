// Run with: bun test src/lib/outfit-layout.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { layoutOutfit, CANVAS_W as W, CANVAS_H as H, type LayoutInput } from "./outfit-layout";

const look = (aspect: number, subcategory = "Cargo Pants"): LayoutInput[] => [
  { id: "tee", bucket: "top", aspect: 1.15, subcategory: "T-Shirt", length: "Regular" },
  { id: "pants", bucket: "bottom", aspect, subcategory, length: null },
  { id: "shoes", bucket: "shoes", aspect: 0.45, subcategory: null },
  { id: "bag", bucket: "bag", aspect: 0.8, subcategory: null, fill: 0.7 },
] as LayoutInput[];
const rect = (aspect: number, id: string, sub?: string) => layoutOutfit(look(aspect, sub)).find((r) => r.id === id)!;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  (Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))) / (b.w * b.h);

test("wide trousers (relaxed cargo photographed legs apart) are not shrunk to a small piece", () => {
  // was 0.40 H for aspect 1.2 against 0.69 H for slim jeans
  assert.ok(rect(1.2, "pants").h >= 0.52 * H);
  assert.ok(rect(1.4, "pants").h >= 0.56 * H);
});

test("slim trousers keep their size; they never exceed the canvas", () => {
  assert.ok(Math.abs(rect(2.4, "pants").h - 0.69 * H) < 0.01 * H);
  for (const a of [1, 1.2, 1.4, 2.4]) {
    const r = rect(a, "pants");
    assert.ok(r.x >= 0 && r.x + r.w <= W && r.y >= 0 && r.y + r.h <= H, `aspect ${a}`);
  }
});

test("the bag beside wide trousers overlaps them no more than beside slim ones", () => {
  const slim = overlap(rect(2.4, "pants"), rect(2.4, "bag"));
  const wide = overlap(rect(1.2, "pants"), rect(1.2, "bag"));
  assert.ok(wide <= slim + 0.02, `${wide} vs ${slim}`);
});

test("shorts and skirts are not stretched by the long-trousers rule", () => {
  const shorts = layoutOutfit([{ id: "s", bucket: "bottom", aspect: 0.8, subcategory: "Shorts", length: null }] as LayoutInput[])[0];
  assert.ok(shorts.h < 0.4 * H);
});
