// Run with: bun test src/lib/rain-rules.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { filterForRain, isWetCondition, rainReason } from "./rain-rules";

const it = (o: Record<string, unknown>) => ({ id: Math.random().toString(), ...o }) as { id: string; category: string; formality?: number | null };

test("wet conditions from the weather labels and other languages", () => {
  for (const c of ["Rain", "Drizzle", "Showers", "Thunderstorm", "Snow", "Pioggia", "lluvia", "Averses"]) assert.ok(isWetCondition(c), c);
  for (const c of ["Clear", "Overcast", "Fog", null]) assert.ok(!isWetCondition(c), String(c));
});

test("what is wrong in the rain", () => {
  assert.equal(rainReason({ category: "Shoes", subcategory: "Ankle Boots", material: ["Suede"] }), "delicateFabric");
  assert.equal(rainReason({ category: "Outerwear", subcategory: "Leather Jacket", material: ["Suede"] }), "delicateFabric");
  assert.equal(rainReason({ category: "Shoes", subcategory: "Sneakers", colors: ["Pure White"] }), "lightColour");
  assert.equal(rainReason({ category: "Shoes", subcategory: "Espadrilles", colors: ["Navy"] }), "openOrCanvasShoe");
  assert.equal(rainReason({ category: "Bottoms", subcategory: "Trousers", styleTags: ["Flare"], colors: ["Navy"] }), "floorLength");
  assert.equal(rainReason({ category: "Dresses", subcategory: "Slip Dress", length: "Maxi", colors: ["Jet Black"] }), "floorLength");
  assert.equal(rainReason({ category: "Bottoms", subcategory: "Jeans", colors: ["Pure White"] }), "lightColour");
  assert.equal(rainReason({ category: "Bags", subcategory: "Tote", material: ["Raffia"] }), "preciousBag");
  assert.equal(rainReason({ category: "Outerwear", subcategory: "Coat", colors: ["Ivory"] }), "lightColour");
  // A beige trench or a light raincoat is made for the rain.
  assert.equal(rainReason({ category: "Outerwear", subcategory: "Trench Coat", colors: ["Beige"] }), null);
  assert.equal(rainReason({ category: "Shoes", subcategory: "Chelsea Boots", colors: ["Jet Black"], material: ["Leather"] }), null);
  // Tops sit under the coat: not filtered.
  assert.equal(rainReason({ category: "Tops", subcategory: "Blouse", colors: ["Pure White"], material: ["Silk"] }), null);
  // …except linen: a linen shirt is a dry-day piece.
  assert.equal(rainReason({ category: "Tops", subcategory: "Shirt", colors: ["Beige"], material: ["Linen"] }), "delicateFabric");
});

test("a wet day: unsuitable pieces give way only to a rain-proof piece just as dressy", () => {
  const whiteSneakers = it({ category: "Shoes", subcategory: "Sneakers", colors: ["Pure White"], formality: 1 });
  const blackBoots = it({ category: "Shoes", subcategory: "Chelsea Boots", colors: ["Jet Black"], formality: 2 });
  const suedeBag = it({ category: "Bags", subcategory: "Shoulder Bag", material: ["Suede"], formality: 3 });
  const kept = filterForRain([whiteSneakers, blackBoots, suedeBag], "Rain");
  assert.ok(!kept.includes(whiteSneakers) && kept.includes(blackBoots));
  assert.ok(kept.includes(suedeBag)); // the only bag: never a look without one
  assert.deepEqual(filterForRain([whiteSneakers, blackBoots], "Clear"), [whiteSneakers, blackBoots]);
});

test("the occasion comes first: satin pumps for a wedding never give way to flat ankle boots", () => {
  const satinPumps = it({ category: "Shoes", subcategory: "Pumps", material: ["Satin"], colors: ["Jet Black"], formality: 5 });
  const ankleBoots = it({ category: "Shoes", subcategory: "Ankle Boots", material: ["Leather"], colors: ["Jet Black"], formality: 2 });
  assert.ok(filterForRain([satinPumps, ankleBoots], "Rain").includes(satinPumps));
  // …but leather pumps just as elegant take their place.
  const leatherPumps = it({ category: "Shoes", subcategory: "Pumps", material: ["Leather"], colors: ["Jet Black"], formality: 5 });
  const kept = filterForRain([satinPumps, ankleBoots, leatherPumps], "Rain");
  assert.ok(!kept.includes(satinPumps) && kept.includes(leatherPumps));
});
