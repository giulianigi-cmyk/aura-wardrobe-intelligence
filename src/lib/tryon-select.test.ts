// Run with: bun test src/lib/tryon-select.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectTryOnItems } from "./tryon-select";

const it = (id: string, category: string, subcategory: string | null = null, style_tags: string[] = []) => ({ id, category, subcategory, style_tags });

test("garments, shoes, bag: unchanged", () => {
  const items = [it("d", "Dresses"), it("s", "Shoes"), it("b", "Bags")];
  assert.deepEqual(selectTryOnItems(items).kept, items);
});

test("small jewellery is left out even when there is room", () => {
  const items = [it("dress", "Dresses"), it("shoes", "Shoes"), it("bracelet", "Accessories", "Bracelet"), it("ring", "Accessories", "Ring"), it("watch", "Accessories", "Watch")];
  const { kept, dropped } = selectTryOnItems(items);
  assert.deepEqual(kept.map((x) => x.id), ["dress", "shoes"]);
  assert.deepEqual(dropped.map((x) => x.id), ["bracelet", "ring", "watch"]);
});

test("statement jewellery is kept; earrings and necklaces when there is room", () => {
  const items = [it("dress", "Dresses"), it("cuff", "Accessories", "Bracelet", ["Statement"]), it("earrings", "Accessories", "Earrings"), it("bag", "Bags")];
  assert.deepEqual(selectTryOnItems(items).kept.map((x) => x.id), ["dress", "cuff", "earrings", "bag"]);
});

test("more than 6: garments, shoes and bag first, outfit order preserved", () => {
  const items = [
    it("earrings", "Accessories", "Earrings"), it("dress", "Dresses"), it("watch", "Accessories", "Watch"),
    it("shoes", "Shoes"), it("bag", "Bags"), it("coat", "Outerwear"), it("necklace", "Accessories", "Necklace"),
    it("sunglasses", "Accessories", "Sunglasses"), it("belt", "Accessories", "Belt"),
  ];
  const { kept } = selectTryOnItems(items);
  assert.equal(kept.length, 6);
  assert.deepEqual(kept.map((x) => x.id), ["dress", "shoes", "bag", "coat", "sunglasses", "belt"]);
});

test("only small jewellery chosen: still tried on (nothing else to show)", () => {
  assert.deepEqual(selectTryOnItems([it("ring", "Accessories", "Ring")]).kept.map((x) => x.id), ["ring"]);
});
