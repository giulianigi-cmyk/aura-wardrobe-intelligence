// Run with: bun test src/lib/season-rules.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isSummerPiece, summerIsOver, withoutSummerPieces } from "./outfit-weather-rules";
import { filterForRain, rainLayerFor, rainReason } from "./rain-rules";

const piece = (id: string, category: string, extra: Record<string, unknown> = {}) => ({ id, category, ...extra });

test("summer pieces: linen whatever its tag; sleeveless/shorts/sandals only when tagged spring–summer", () => {
  assert.equal(isSummerPiece(piece("a", "Tops", { subcategory: "Shirt", material: ["Linen"], season: "All Seasons" })), true);
  assert.equal(isSummerPiece(piece("b", "Dresses", { sleeveLength: "Sleeveless", season: "Spring, Summer" })), true);
  assert.equal(isSummerPiece(piece("c", "Tops", { sleeveLength: "Sleeveless", season: "All Seasons" })), false);
  assert.equal(isSummerPiece(piece("d", "Bottoms", { subcategory: "Shorts", season: "Summer" })), true);
  assert.equal(isSummerPiece(piece("e", "Shoes", { subcategory: "Sandals", season: "Summer", formality: 5 })), false);
  assert.equal(isSummerPiece(piece("f", "Tops", { subcategory: "Sweater", season: "Autumn, Winter" })), false);
});

test("summer is over outside June–September with a cool morning — not in a warm place, not without a reading", () => {
  assert.equal(summerIsOver("2026-10-08", 12), true);
  assert.equal(summerIsOver("2026-10-08", 22), false); // Marrakech, the Bahamas
  assert.equal(summerIsOver("2026-07-15", 12), false);
  assert.equal(summerIsOver("2026-10-08", null), false);
});

test("summer pieces leave only where the category has something else", () => {
  const items = [
    piece("linen", "Tops", { material: ["Linen"] }), piece("knit", "Tops", { subcategory: "Sweater", season: "Autumn" }),
    piece("sandal", "Shoes", { subcategory: "Sandals", season: "Summer" }),
  ];
  assert.deepEqual(withoutSummerPieces(items, "2026-10-08", 12).map((i) => i.id), ["knit", "sandal"]);
  assert.deepEqual(withoutSummerPieces(items, "2026-10-08", 20).map((i) => i.id), ["linen", "knit", "sandal"]);
});

test("rain: open-back shoes give way to a closed pair just as dressy; a raincoat is the first outer layer", () => {
  assert.equal(rainReason(piece("s", "Shoes", { subcategory: "Slingback" })), "openOrCanvasShoe");
  const shoes = [piece("sling", "Shoes", { subcategory: "Slingback", formality: 4 }), piece("pump", "Shoes", { subcategory: "Pumps", formality: 4 })];
  assert.deepEqual(filterForRain(shoes, "Rain").map((s) => s.id), ["pump"]);
  const outer = [piece("blazer", "Outerwear", { subcategory: "Blazer" }), piece("trench", "Outerwear", { subcategory: "Trench Coat" }), piece("suede", "Outerwear", { subcategory: "Jacket", material: ["Suede"] })];
  assert.equal(rainLayerFor([piece("tee", "Tops")], outer)?.id, "trench");
  assert.equal(rainLayerFor([piece("tee", "Tops")], [outer[0], outer[2]])?.id, "blazer");
  assert.equal(rainLayerFor([outer[0]], outer), null);
});

test("a bag tagged only for daytime never goes in an evening look; untagged or evening-tagged bags do", async () => {
  const { isDayOnlyBag } = await import("./outfit-styling-rules");
  assert.equal(isDayOnlyBag({ category: "Bags", occasion: "Everyday, Work" }), true);
  assert.equal(isDayOnlyBag({ category: "Bags", occasion: "Everyday, Work, Weekend, Travel" }), true);
  assert.equal(isDayOnlyBag({ category: "Bags", occasion: "Everyday, Evening" }), false);
  assert.equal(isDayOnlyBag({ category: "Bags", occasion: "" }), false);
  assert.equal(isDayOnlyBag({ category: "Shoes", occasion: "Everyday, Work" }), false);
});
