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

import { orderForTryOn, underLayerFor } from "./tryon-select";

test("layering order: dress and base top first, the shirt over them, then shoes and bag", () => {
  const items = [it("bag", "Bags"), it("shirt", "Tops", "Shirt"), it("shoes", "Shoes"), it("dress", "Dresses"), it("earrings", "Accessories", "Earrings")];
  assert.deepEqual(orderForTryOn(items).map((x) => x.id), ["dress", "shirt", "shoes", "bag", "earrings"]);
  const sep = [it("shirt", "Tops", "Shirt"), it("skirt", "Bottoms", "Skirt"), it("tank", "Tops", "Tank Top")];
  assert.deepEqual(orderForTryOn(sep).map((x) => x.id), ["tank", "skirt", "shirt"]);
});

test("an open-front top knows what is under it", () => {
  const shirt = it("shirt", "Tops", "Shirt");
  assert.equal(underLayerFor(shirt, [shirt, it("dress", "Dresses")]), "dress");
  assert.equal(underLayerFor(shirt, [shirt, it("tank", "Tops", "Tank Top"), it("jeans", "Bottoms", "Jeans")]), "top");
  assert.equal(underLayerFor(shirt, [shirt, it("jeans", "Bottoms", "Jeans")]), null);
  assert.equal(underLayerFor(it("tee", "Tops", "T-Shirt"), [it("dress", "Dresses")]), null);
});

test("a jacket or blazer over a top is worn open; over a dress its own hint applies", () => {
  const blazer = it("blazer", "Outerwear", "Blazer");
  assert.equal(underLayerFor(blazer, [blazer, it("tee", "Tops", "T-Shirt"), it("trousers", "Bottoms", "Trousers")]), "top");
  assert.equal(underLayerFor(blazer, [blazer, it("dress", "Dresses")]), null);
  assert.equal(underLayerFor(blazer, [blazer, it("trousers", "Bottoms", "Trousers")]), null);
});
