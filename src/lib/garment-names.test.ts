// Run with: bun test src/lib/garment-names.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { colorName, garmentName, hasColorName, hasGarmentName, localizeLabel } from "./garment-names";
import { COLOR_NAMES } from "./color-palette";
import { SUBCATEGORY_OPTIONS } from "./wardrobe-options";

test("owned-piece labels read in the person's language; brands and models stay", () => {
  assert.equal(localizeLabel("Aquazzura · Jet Black · Sandals", "it"), "Aquazzura · Nero · Sandali");
  assert.equal(localizeLabel("VICTORIA BECKHAM · Denim Wash · Jeans · Alina", "fr"), "VICTORIA BECKHAM · Délavé denim · Jean · Alina");
  assert.equal(localizeLabel("H&m · Denim Wash · Jeans", "es"), "H&m · Lavado denim · Vaqueros");
  assert.equal(localizeLabel("Aquazzura · Jet Black · Sandals", "en"), "Aquazzura · Jet Black · Sandals");
  assert.equal(colorName("teal", "it"), "Verde petrolio");
  assert.equal(garmentName("Top Handle Bag", "it"), "Borsa a mano");
  assert.equal(colorName("Unknown Shade", "it"), "Unknown Shade");
});

test("every palette colour and every garment type has a translation", () => {
  for (const c of COLOR_NAMES) assert.ok(hasColorName(c), `colour ${c}`);
  for (const sub of Object.values(SUBCATEGORY_OPTIONS).flat()) assert.ok(hasGarmentName(sub), `type ${sub}`);
  for (const cat of Object.keys(SUBCATEGORY_OPTIONS)) assert.ok(hasGarmentName(cat), `category ${cat}`);
});
