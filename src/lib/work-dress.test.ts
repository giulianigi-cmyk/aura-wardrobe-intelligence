// Run with: bun test src/lib/work-dress.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isLogoOrGraphicTop, isWorkActivityText } from "./work-dress";

test("a T-shirt with a logo detail is a logo top; a plain one is not", () => {
  assert.equal(isLogoOrGraphicTop({ category: "Tops", subcategory: "T-Shirt", details: ["logo"] }), true);
  assert.equal(isLogoOrGraphicTop({ category: "Tops", subcategory: "T-Shirt", details: [] }), false);
  assert.equal(isLogoOrGraphicTop({ category: "Tops", subcategory: "Sweatshirt", styleTags: ["Graphic print"] }), true);
});

test("a shirt or a polo with a small logo stays a work piece", () => {
  assert.equal(isLogoOrGraphicTop({ category: "Tops", subcategory: "Shirt", details: ["logo"] }), false);
  assert.equal(isLogoOrGraphicTop({ category: "Tops", subcategory: "Polo", details: ["logo"] }), false);
  assert.equal(isLogoOrGraphicTop({ category: "Bags", subcategory: "Tote", details: ["logo"] }), false);
});

test("a trade fair, a meeting or a business dress code is a work activity", () => {
  assert.equal(isWorkActivityText("Gimav con Barbara", "Business Casual"), true);
  assert.equal(isWorkActivityText("Fiera Milano Rho"), true);
  assert.equal(isWorkActivityText("Trade fair day 2"), true);
  assert.equal(isWorkActivityText("Riunione clienti"), true);
  assert.equal(isWorkActivityText("Reunión con el equipo"), true);
  assert.equal(isWorkActivityText("Réunion"), true);
  assert.equal(isWorkActivityText("Visita", "Work"), true);
});

test("a holiday activity is not a work activity", () => {
  assert.equal(isWorkActivityText("Cena al ristorante", "Evening"), false);
  assert.equal(isWorkActivityText("Museo e passeggiata"), false);
  assert.equal(isWorkActivityText("Volo DUS-ZRH", "Travel"), false);
  assert.equal(isWorkActivityText("Homework"), false);
});
