// Run with: bun test src/lib/wardrobe-feedback.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { alreadyOwnedPieces, notSimilarItemIds, productKey, type WardrobeFeedbackRow } from "./wardrobe-feedback";
import { ownedEquivalent } from "./gap-ownership";

test("product key: same page with or without tracking parameters, else brand + name", () => {
  assert.equal(productKey({ sourceUrl: "https://www.cartier.com/it-it/jewellery/rings/juste-un-clou-ring-B4225900.html?utm_source=x#top" }),
    "url:cartier.com/it-it/jewellery/rings/juste-un-clou-ring-b4225900.html");
  assert.equal(productKey({ sourceUrl: null, brand: "Cartier", title: "Anello  Juste un Clou" }), "name:cartier|anello juste un clou");
  assert.equal(productKey({}), null);
});

const rows: WardrobeFeedbackRow[] = [
  { kind: "already_own", category: "Bags", subcategory: "Crossbody", colors: ["Black"], product_key: null, owned_item_id: null },
  { kind: "not_similar", category: "Shoes", subcategory: "Pumps", colors: ["Jet Black"], product_key: "url:shop.com/sling", owned_item_id: "loub" },
];

test("'Ce l'ho già' makes the gap engine treat that piece as owned", () => {
  assert.ok(ownedEquivalent({ category: "Bags", subcategory: "Crossbody", colors: ["Jet Black"] }, alreadyOwnedPieces(rows)));
  assert.equal(ownedEquivalent({ category: "Bags", subcategory: "Tote", colors: ["Camel"] }, alreadyOwnedPieces(rows)), null);
});

test("'Non è simile' excludes that owned piece for that product only", () => {
  assert.deepEqual([...notSimilarItemIds(rows, "url:shop.com/sling")], ["loub"]);
  assert.equal(notSimilarItemIds(rows, "url:shop.com/other").size, 0);
});
