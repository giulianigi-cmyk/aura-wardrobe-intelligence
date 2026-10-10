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
  // was 0.40 H for aspect 1.2 against 0.69 H for slim jeans; now at least ~85% of slim (0.60 H)
  assert.ok(rect(1.2, "pants").h >= 0.51 * H);
  assert.ok(rect(1.4, "pants").h >= 0.51 * H);
});

test("slim trousers keep their size; they never exceed the canvas", () => {
  assert.ok(Math.abs(rect(2.4, "pants").h - 0.60 * H) < 0.01 * H);
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

test("with a coat, the shoes sit bottom-left and boots keep a readable size; small accessories don't shrink to a dot", () => {
  const rects = layoutOutfit([
    { id: "blazer", bucket: "outer", aspect: 1.05, subcategory: "Blazer" },
    { id: "trousers", bucket: "bottom", aspect: 2.3, subcategory: "Trousers" },
    { id: "blouse", bucket: "top", aspect: 1.0, subcategory: "Blouse" },
    { id: "watch", bucket: "wrist", aspect: 2.6, subcategory: "Watch" },
    { id: "bag", bucket: "bag", aspect: 0.85, subcategory: "Top Handle", fill: 0.5 },
    { id: "belt", bucket: "belt", aspect: 0.35, subcategory: "Belt" },
    { id: "boots", bucket: "shoes", aspect: 2.1, subcategory: "Knee Boots" },
  ]);
  const get = (id: string) => rects.find((r) => r.id === id)!;
  const boots = get("boots");
  assert.ok(boots.x + boots.w / 2 < W / 2, "boots on the left");
  assert.ok(boots.h > 0.25 * H, "knee boots tall enough to read");
  assert.ok(boots.y + boots.h <= H * (1 - 0.115) + 1, "above the logo strip");
  assert.ok(get("watch").h > 0.11 * H, "watch still visible");
  assert.ok(get("belt").w > 0.15 * W, "belt still visible");
  const blazer = get("blazer"), trousers = get("trousers");
  assert.ok(blazer.h > 0.7 * trousers.h, "blazer in proportion with the trousers");
});
