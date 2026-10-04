// Run with: bun test src/lib/garment-names.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { colorName, garmentName, hasColorName, hasGarmentGender, hasGarmentName, localizeLabel } from "./garment-names";
import { COLOR_NAMES } from "./color-palette";
import { SUBCATEGORY_OPTIONS } from "./wardrobe-options";

test("owned-piece labels read naturally in the person's language: garment first, colour agreeing", () => {
  assert.equal(localizeLabel("Aquazzura · Jet Black · Sandals", "it"), "Aquazzura · Sandali neri");
  assert.equal(localizeLabel("Aquazzura · Jet Black · Sandals", "es"), "Aquazzura · Sandalias negras");
  assert.equal(localizeLabel("Aquazzura · Jet Black · Sandals", "fr"), "Aquazzura · Sandales noires");
  assert.equal(localizeLabel("Hermès · Jet Black · Top Handle Bag", "it"), "Hermès · Borsa a mano nera");
  assert.equal(localizeLabel("Prada · Pure White · Skirt", "it"), "Prada · Gonna bianca");
  assert.equal(localizeLabel("Gucci · Cherry Red · Pumps", "it"), "Gucci · Décolleté rosso ciliegia");
  assert.equal(localizeLabel("Zara · Navy · Coat", "it"), "Zara · Cappotto blu navy");
  assert.equal(localizeLabel("Zara · Striped · Shirt", "it"), "Zara · Camicia a righe");
  assert.equal(localizeLabel("VICTORIA BECKHAM · Denim Wash · Jeans · Alina", "it"), "VICTORIA BECKHAM · Jeans lavaggio denim · Alina");
  assert.equal(localizeLabel("H&m · Denim Wash · Jeans", "fr"), "H&m · Jean délavé denim");
  assert.equal(localizeLabel("Max Mara · Jet Black · Coat", "fr"), "Max Mara · Manteau noir");
  assert.equal(localizeLabel("Aquazzura · Jet Black · Sandals", "en"), "Aquazzura · Jet Black · Sandals");
  assert.equal(colorName("teal", "it"), "Verde petrolio");
  assert.equal(garmentName("Top Handle Bag", "it"), "Borsa a mano");
  assert.equal(colorName("Unknown Shade", "it"), "Unknown Shade");
});

test("every palette colour and every garment type has a translation", () => {
  for (const c of COLOR_NAMES) assert.ok(hasColorName(c), `colour ${c}`);
  for (const sub of Object.values(SUBCATEGORY_OPTIONS).flat()) assert.ok(hasGarmentName(sub), `type ${sub}`);
  for (const cat of Object.keys(SUBCATEGORY_OPTIONS)) assert.ok(hasGarmentName(cat), `category ${cat}`);
  for (const g of [...Object.values(SUBCATEGORY_OPTIONS).flat(), ...Object.keys(SUBCATEGORY_OPTIONS)]) assert.ok(hasGarmentGender(g), `gender ${g}`);
});
