// Run with: bun test src/lib/purchase-visual.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { mapVisual, recorded, visualPrompt } from "./purchase-visual.server";
import type { WardrobeItem } from "./aura-types";

test("model refs map back to the owned pieces; unknown or repeated refs are dropped", () => {
  const out = mapVisual([
    { ref: "C2", similarity: 82, note: "lavaggio più scuro" },
    { ref: "C1", similarity: 140, note: "" },
    { ref: "C2", similarity: 10 },
    { ref: "C9", similarity: 99 },
  ], ["a", "b"]);
  assert.deepEqual(out, [{ itemId: "b", similarity: 82, note: "lavaggio più scuro" }, { itemId: "a", similarity: 100, note: "" }]);
});

test("the prompt asks about the look of any kind of piece, in the person's language", () => {
  const p = visualPrompt({ category: "Bags", subcategory: "Shoulder Bag", title: "Le 5 à 7" }, ["C1", "C2"], "Italian");
  assert.match(p, /shoulder bag/);
  assert.match(p, /handles, strap/);
  assert.match(p, /in Italian/);
});

test("owned pieces carry what the person recorded next to their photo", () => {
  const it = { id: "x", colors: ["Jet Black"], material: ["Satin"], details: ["embellished"], heel_height: "High" } as unknown as WardrobeItem;
  assert.equal(recorded(it), " (recorded: colours Jet Black; materials Satin; details embellished; heel High)");
  assert.equal(recorded(undefined), "");
  assert.match(visualPrompt({ category: "Shoes", subcategory: "Sandals", title: null }, ["C1"], "Italian"), /never say it lacks that/);
});
