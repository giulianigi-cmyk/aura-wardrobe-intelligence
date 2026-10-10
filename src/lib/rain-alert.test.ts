// Run with: bun test src/lib/rain-alert.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { rainAlertFor, rainAlertMessage } from "./rain-alert";

const shirt = { id: "shirt", category: "Tops", subcategory: "Shirt", material: ["Linen"], colors: ["Beige"] };
const pumps = { id: "pumps", category: "Shoes", subcategory: "Pumps", material: ["Leather"], colors: ["Jet Black"] };
const trousers = { id: "trousers", category: "Bottoms", subcategory: "Trousers", material: ["Wool"], colors: ["Jet Black"] };

test("rain + a linen shirt: change the outfit (reported case)", () => {
  const a = rainAlertFor({ code: 61, precipitation: 80 }, [shirt, pumps, trousers]);
  assert.equal(a?.kind, "swap");
  assert.deepEqual(a?.unsuitableIds, ["shirt"]);
  const m = rainAlertMessage("it", a!, ["camicia di lino beige"]);
  assert.match(m.title, /piove/);
  assert.match(m.body, /^Camicia di lino beige/);
});

test("rain + a rain-proof outfit: just the umbrella; dry day: nothing", () => {
  const a = rainAlertFor({ code: 3, precipitation: 70 }, [pumps, trousers]);
  assert.equal(a?.kind, "umbrella");
  assert.match(rainAlertMessage("it", a!, []).body, /70%.*ombrello/);
  assert.equal(rainAlertFor({ code: 1, precipitation: 10 }, [shirt]), null);
});
