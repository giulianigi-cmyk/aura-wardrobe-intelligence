// Run with: bun test src/lib/work-dress.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isLogoOrGraphicTop, isWorkActivityText, isProfessionalEventText, isTailoredBottom, isUnderJacketTop } from "./work-dress";

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

test("a trade fair, an exhibition, a congress or a client meeting is a professional event; an office day is not", () => {
  assert.equal(isProfessionalEventText("Work · Fiera Glasstec — Messe Düsseldorf"), true);
  assert.equal(isProfessionalEventText("Exhibition opening"), true);
  assert.equal(isProfessionalEventText("Congresso medico"), true);
  assert.equal(isProfessionalEventText("Pranzo con cliente"), true);
  assert.equal(isProfessionalEventText("Work"), false);
  assert.equal(isProfessionalEventText("Museo e passeggiata"), false);
});

test("professional event pieces: tailored bottoms and under-jacket tops only", () => {
  assert.equal(isTailoredBottom({ category: "Bottoms", subcategory: "Trousers" }), true);
  assert.equal(isTailoredBottom({ category: "Bottoms", subcategory: "Skirt" }), true);
  assert.equal(isTailoredBottom({ category: "Bottoms", subcategory: "Leggings" }), false);
  assert.equal(isTailoredBottom({ category: "Bottoms", subcategory: "Jeans" }), false);
  assert.equal(isUnderJacketTop({ category: "Tops", subcategory: "Shirt" }), true);
  assert.equal(isUnderJacketTop({ category: "Tops", subcategory: "Blouse" }), true);
  assert.equal(isUnderJacketTop({ category: "Tops", subcategory: "Knit Top" }), true);
  assert.equal(isUnderJacketTop({ category: "Tops", subcategory: "T-Shirt" }), false);
  assert.equal(isUnderJacketTop({ category: "Tops", subcategory: "Tank Top" }), false);
});
