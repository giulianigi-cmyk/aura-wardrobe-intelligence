// Run with: bun test src/lib/tryon-select.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectTryOnItems } from "./tryon-select";

const it = (id: string, category: string, subcategory: string | null = null) => ({ id, category, subcategory });

test("up to 6 pieces: unchanged", () => {
  const items = [it("d", "Dresses"), it("s", "Shoes"), it("b", "Bags")];
  assert.deepEqual(selectTryOnItems(items).kept, items);
});

test("more than 6: garments, shoes and bag kept, small jewellery left out, order preserved", () => {
  const items = [
    it("earrings", "Accessories", "Earrings"), it("dress", "Dresses"), it("watch", "Accessories", "Watch"),
    it("shoes", "Shoes"), it("bag", "Bags"), it("coat", "Outerwear"), it("necklace", "Accessories", "Necklace"),
    it("sunglasses", "Accessories", "Sunglasses"),
  ];
  const { kept, dropped } = selectTryOnItems(items);
  assert.equal(kept.length, 6);
  assert.deepEqual(kept.map((x) => x.id), ["earrings", "dress", "shoes", "bag", "coat", "sunglasses"]);
  assert.deepEqual(dropped.map((x) => x.id), ["watch", "necklace"]);
});
