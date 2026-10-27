// Run with: bun test src/lib/evening-bag-rule.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { bagClashesWithDressyLook } from "./outfit-styling-rules";

test("a leaf-print rust/ochre clutch clashes with velvet and sequins; a black-silver one doesn't", () => {
  const look = [
    { category: "Tops", subcategory: "Blouse", formality: 5, colors: ["Navy"], material: ["Sequins"] },
    { category: "Bottoms", subcategory: "Skirt", formality: 5, colors: ["Jet Black"], material: ["Velvet", "Synthetic"] },
    { category: "Shoes", subcategory: "Ankle Boots", formality: 4, colors: ["Jet Black"], details: ["patent"] },
  ];
  const leafClutch = { category: "Bags", subcategory: "Clutch", formality: 4, colors: ["Chocolate", "Ochre", "Rust", "Khaki"], details: ["handheld", "logo"] };
  const jewelClutch = { category: "Bags", subcategory: "Clutch", formality: 5, colors: ["Jet Black", "Silver"], details: ["embellished"] };
  const nudeClutch = { category: "Bags", subcategory: "Clutch", formality: 4, colors: ["Nude"], details: ["handheld"] };
  assert.equal(bagClashesWithDressyLook(leafClutch, look), true);
  assert.equal(bagClashesWithDressyLook(jewelClutch, look), false);
  assert.equal(bagClashesWithDressyLook(nudeClutch, look), false);
  // the same bag is fine with a casual daytime look
  assert.equal(bagClashesWithDressyLook(leafClutch, [{ category: "Tops", formality: 3, colors: ["White"], material: ["Cotton"] }]), false);
});
