// Run with: bun test src/lib/purchase-similarity.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { comparablePieces, similarOwnedPiece } from "./purchase-similarity";
import type { WardrobeItem } from "./aura-types";

const own = (o: Partial<WardrobeItem> & { id: string }) => ({ category: "Accessories", subcategory: null, colors: [], brand: null, color: null, model: null, ...o }) as unknown as WardrobeItem;
const wardrobe = [
  own({ id: "watch1", subcategory: "Watch", brand: "Cartier", colors: ["Jet Black", "Pure White", "Silver"] }),
  own({ id: "watch2", subcategory: "Watch", brand: "Cartier", colors: ["Silver", "Gold"] }),
  own({ id: "bracelet", subcategory: "Bracelet", brand: "DAMIANI", colors: ["Silver"] }),
];

test("a Cartier ring is not similar to Cartier watches (reported case)", () => {
  const ring = { category: "Accessories", subcategory: "Ring", colors: ["Gold"], brand: "Cartier" };
  assert.equal(similarOwnedPiece(ring, wardrobe), null);
  assert.deepEqual(comparablePieces(ring, wardrobe), []); // no ring owned → a real gap
});

test("a gold Cartier bracelet vs a silver Damiani bracelet: same kind, but no colour/brand in common", () => {
  const love = { category: "Accessories", subcategory: "Bracelet", colors: ["Gold"], brand: "Cartier" };
  assert.deepEqual(comparablePieces(love, wardrobe).map((x) => x.id), ["bracelet"]);
  assert.equal(similarOwnedPiece(love, wardrobe), null);
});

test("a similar piece is named", () => {
  const watch = { category: "Accessories", subcategory: "Watch", colors: ["Gold"], brand: "Cartier" };
  const s = similarOwnedPiece(watch, wardrobe)!;
  assert.equal(s.itemId, "watch2");
  assert.equal(s.label, "Cartier · Silver · Watch");
});

test("accessory with unknown type: nothing is called similar", () => {
  assert.equal(similarOwnedPiece({ category: "Accessories", subcategory: null, colors: ["Gold"], brand: "Cartier" }, wardrobe), null);
});

test("patent slingback vs owned closed leather pumps, same house and colour: not a duplicate (reported)", () => {
  const pumps = own({ id: "loub", category: "Shoes", subcategory: "Pumps", brand: "Christian Louboutin", colors: ["Jet Black", "Cherry Red"], material: ["Leather"], style_tags: ["Elegant"] } as never);
  (pumps as unknown as { closure: string }).closure = "Slip-On";
  const slingback = { category: "Shoes", subcategory: "Pumps", colors: ["Jet Black"], brand: "Christian Louboutin", text: "So Kate Sling 85 slingback in vernice nera" };
  const s = similarOwnedPiece(slingback, [pumps]);
  assert.equal(s?.verdict, "maybe"); // was "certain" → skip
  assert.deepEqual(s?.differences.sort(), ["patent", "slingback"]);
  // the very same closed leather pump stays a certain duplicate
  assert.equal(similarOwnedPiece({ ...slingback, text: "So Kate 120 in pelle" }, [pumps])?.verdict, "certain");
});
