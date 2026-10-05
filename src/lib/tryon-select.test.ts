// Run with: bun test src/lib/tryon-select.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isNotWornOnAvatar, orderForTryOn, selectTryOnItems, underLayerFor } from "./tryon-select";

const it = (id: string, category: string, subcategory: string | null = null, style_tags: string[] = []) => ({ id, category, subcategory, style_tags });

test("the avatar wears clothes and shoes; bags and every accessory are left out and reported", () => {
  const items = [it("dress", "Dresses"), it("shoes", "Shoes"), it("bag", "Bags"), it("earrings", "Accessories", "Earrings"), it("belt", "Accessories", "Belt")];
  const { kept, accessories, overLimit } = selectTryOnItems(items);
  assert.deepEqual(kept.map((x) => x.id), ["dress", "shoes"]);
  assert.deepEqual(accessories.map((x) => x.id), ["bag", "earrings", "belt"]);
  assert.deepEqual(overLimit, []);
  assert.equal(isNotWornOnAvatar({ category: "Bags" }), true);
  assert.equal(isNotWornOnAvatar({ category: "Shoes" }), false);
});

test("more than 6 garments: clothes first, then shoes, outfit order kept; the rest reported apart", () => {
  const items = [it("s", "Shoes"), ...["a", "b", "c", "d", "e", "f"].map((id) => it(id, "Tops"))];
  const { kept, overLimit } = selectTryOnItems(items);
  assert.deepEqual(kept.map((x) => x.id), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(overLimit.map((x) => x.id), ["s"]);
});

test("only bags or accessories chosen: nothing to put on the avatar", () => {
  const { kept, accessories } = selectTryOnItems([it("ring", "Accessories", "Ring"), it("bag", "Bags")]);
  assert.equal(kept.length, 0);
  assert.equal(accessories.length, 2);
});

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
