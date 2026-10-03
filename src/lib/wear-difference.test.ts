// Run with: bun test src/lib/wear-difference.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { occasionList, wearDifference } from "./wear-difference";

test("reported case: high crystal Cleo vs the flat Rene Caovilla sandals owned", () => {
  const cleo = { heelHeight: "High", dayEvening: "evening", formality: 5, occasions: ["Cocktail", "Black Tie", "Wedding Guest"] };
  const owned = { heelHeight: "Flat", dayEvening: "both", formality: 3, occasions: occasionList("Everyday, Resort, Evening") };
  assert.deepEqual(wearDifference(cleo, owned), { changes: ["higherHeel", "moreEvening", "moreFormal"], newOccasions: ["Cocktail", "Black Tie", "Wedding Guest"] });
});

test("same way of wearing → nothing to say", () => {
  const p = { heelHeight: "High", dayEvening: "both", formality: 4, occasions: ["Evening"] };
  assert.equal(wearDifference(p, { ...p, occasions: ["Evening", "Work"] }), null);
});

test("unknown data on either side is never guessed", () => {
  assert.equal(wearDifference({ heelHeight: null, dayEvening: null, formality: null, occasions: ["Work"] }, { heelHeight: "High", dayEvening: "day", formality: 2, occasions: [] }), null);
});
