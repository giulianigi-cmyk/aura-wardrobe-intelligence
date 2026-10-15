// Run with: bun test src/lib/outfit-layout.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { layoutOutfit, BOARD_SCALE as K, CANVAS_W as W, CANVAS_H as H, type LayoutInput } from "./outfit-layout";
// Sizes below are the laid-out ones; the finished board is drawn at BOARD_SCALE (K) for air around it.

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
  assert.ok(rect(1.2, "pants").h >= 0.51 * K * H);
  assert.ok(rect(1.4, "pants").h >= 0.51 * K * H);
});

test("slim trousers keep their size; they never exceed the canvas", () => {
  assert.ok(Math.abs(rect(2.4, "pants").h - 0.60 * K * H) < 0.01 * H);
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

test("a jacket is drawn wider than the top worn under it (quilted jacket with wide sleeves)", () => {
  const rects = layoutOutfit([
    { id: "jacket", bucket: "outer", aspect: 0.75, subcategory: "Puffer Jacket" },
    { id: "jeans", bucket: "bottom", aspect: 1.45, subcategory: "Jeans" },
    { id: "tshirt", bucket: "top", aspect: 0.95, subcategory: "T-Shirt" },
    { id: "boots", bucket: "shoes", aspect: 1.1, subcategory: "Chelsea Boots" },
  ] as LayoutInput[]);
  const get = (id: string) => rects.find((r) => r.id === id)!;
  assert.ok(get("jacket").w >= 1.25 * get("tshirt").w, "jacket wider than the T-shirt");
  assert.ok(get("jacket").x >= 0 && get("jacket").x + get("jacket").w <= W, "inside the canvas");
});

test("a jacket starts at the top of the board, and the bag and belt beside it keep a readable size", () => {
  const rects = layoutOutfit([
    { id: "jacket", bucket: "outer", aspect: 1.1, subcategory: "Shacket" },
    { id: "jeans", bucket: "bottom", aspect: 1.42, subcategory: "Jeans" },
    { id: "body", bucket: "top", aspect: 1.26, subcategory: "Bodysuit" },
    { id: "bag", bucket: "bag", aspect: 0.9, subcategory: "Top Handle Bag", fill: 0.7 },
    { id: "belt", bucket: "belt", aspect: 0.21, subcategory: "Belt" },
    { id: "shoes", bucket: "shoes", aspect: 0.9, subcategory: "Flats", fill: 0.35 },
  ]);
  const r = (id: string) => rects.find((x) => x.id === id)!;
  assert.ok(r("jacket").y / H < 0.14, "jacket near the top, with air above it");
  assert.ok(r("bag").w / W >= 0.3 * K, "bag at least 30% wide before the board scale");
  assert.ok(r("belt").w / W >= 0.28, "belt at least 28% wide");
  // nothing overlaps in the right-hand column
  assert.ok(r("bag").y + r("bag").h <= r("belt").y);
});

test("a suit jacket under a coat: the coat stays big on the left, the jacket lies over it and leaves the top and the shoes their room", () => {
  const rects = layoutOutfit([
    { id: "blazer", bucket: "outer", aspect: 1.05, subcategory: "Blazer" },
    { id: "coat", bucket: "outer", aspect: 1.6, subcategory: "Coat", length: "Long" },
    { id: "trousers", bucket: "bottom", aspect: 2.3, subcategory: "Trousers" },
    { id: "shirt", bucket: "top", aspect: 1.0, subcategory: "Shirt" },
    { id: "bag", bucket: "bag", aspect: 0.85, subcategory: "Top Handle", fill: 0.5 },
    { id: "pumps", bucket: "shoes", aspect: 0.5, subcategory: "Pumps" },
  ] as LayoutInput[]);
  const get = (id: string) => rects.find((r) => r.id === id)!;
  const coat = get("coat"), blazer = get("blazer"), shirt = get("shirt"), pumps = get("pumps");
  assert.ok(coat.h > blazer.h, "the coat reads bigger than the jacket on it");
  assert.ok(blazer.z > coat.z, "the jacket is drawn over the coat where they touch");
  assert.ok(coat.x < blazer.x && blazer.y > coat.y, "the jacket sits lower and to the right of the coat");
  // side by side: the coat does not hide the jacket, the jacket lies open over the shirt (most of it shows)
  assert.ok(overlap(coat, blazer) <= 0.2, `the coat does not hide the jacket (${overlap(coat, blazer).toFixed(2)})`);
  assert.ok(overlap(blazer, shirt) <= 0.4, "the shirt still shows under the jacket");
  assert.ok(blazer.z > shirt.z, "the jacket is drawn over the shirt");
  assert.ok(overlap(get("bag"), blazer) <= 0.15, "the bag does not cover the jacket");
  assert.ok(coat.y + coat.h <= pumps.y, "the coat ends above the shoes");
  for (const r of rects) assert.ok(r.x >= 0 && r.x + r.w <= W && r.y + r.h <= H * (1 - 0.115) + 1, r.id);
});

test("a ring is drawn much smaller than the bracelet beside it, not the other way round", () => {
  const rects = layoutOutfit([
    { id: "dress", bucket: "dress", aspect: 2.6, subcategory: "Maxi Dress", length: "Maxi" },
    { id: "ring", bucket: "wrist", aspect: 0.8, subcategory: "Ring", fill: 0.3 },
    { id: "bracelet", bucket: "wrist", aspect: 0.7, subcategory: "Bracelet", fill: 0.3 },
    { id: "shoes", bucket: "shoes", aspect: 0.9, subcategory: "Sandals" },
  ] as LayoutInput[]);
  const r = (id: string) => rects.find((x) => x.id === id)!;
  const side = (x: { w: number; h: number }) => Math.max(x.w, x.h);
  assert.ok(side(r("ring")) < side(r("bracelet")) * 0.6, `ring ${side(r("ring"))} vs bracelet ${side(r("bracelet"))}`);
});
