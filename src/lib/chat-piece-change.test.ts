// Run with: bun test src/lib/chat-piece-change.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyPieceChange, detectPieceChange } from "./chat-piece-change";

const cats: Record<string, string> = {
  dress: "Dresses", dress2: "Dresses", pumps: "Shoes", sandals: "Shoes", bigBag: "Bags", clutch: "Bags", earrings: "Accessories", top: "Tops", top2: "Tops", skirt: "Bottoms", skirt2: "Bottoms",
};
const catOf = (id: string) => cats[id];
const prev = ["dress", "pumps", "bigBag", "earrings"];

test("'una borsa più piccola' changes only the bag (reported case)", () => {
  const ch = detectPieceChange("Forse meglio una borsa più piccola?", prev, catOf)!;
  assert.deepEqual(ch.targetCategories, ["Bags"]);
  assert.deepEqual(ch.keepIds, ["dress", "pumps", "earrings"]);
  // the model answered with a whole new outfit: only its bag is taken
  assert.deepEqual(applyPieceChange(["dress2", "sandals", "clutch", "earrings"], ch, prev, catOf), ["dress", "pumps", "earrings", "clutch"]);
});

test("other languages and wordings", () => {
  assert.ok(detectPieceChange("can you swap the shoes?", prev, catOf));
  assert.ok(detectPieceChange("cambia solo le scarpe", prev, catOf));
  assert.ok(detectPieceChange("otro bolso más pequeño", prev, catOf));
  assert.deepEqual(detectPieceChange("un altro vestito", prev, catOf)!.keepIds, ["pumps", "bigBag", "earrings"]);
});

test("not a one-piece change: whole new look, no change word, nothing to change, no previous outfit", () => {
  assert.equal(detectPieceChange("cambia tutto il look", prev, catOf), null);
  assert.equal(detectPieceChange("un altro outfit con la borsa", prev, catOf), null);
  assert.equal(detectPieceChange("mi piace la borsa", prev, catOf), null);
  assert.equal(detectPieceChange("un altro cappotto", prev, catOf), null); // no coat in the outfit
  assert.equal(detectPieceChange("una borsa più piccola", [], catOf), null);
});

test("if the model proposes no new piece of that kind, the previous one stays", () => {
  const ch = detectPieceChange("borsa più piccola", prev, catOf)!;
  assert.deepEqual(applyPieceChange(["dress2", "sandals"], ch, prev, catOf), ["dress", "pumps", "earrings", "bigBag"]);
});

test("changing the dress lets a top + skirt replace it, everything else stays", () => {
  const ch = detectPieceChange("cambia il vestito", prev, catOf)!;
  assert.deepEqual(applyPieceChange(["top", "skirt", "sandals", "bigBag"], ch, prev, catOf), ["pumps", "bigBag", "earrings", "top", "skirt"]);
});

test("top + skirt outfit: 'un'altra gonna' keeps the top", () => {
  const prev2 = ["top", "skirt", "pumps", "bigBag"];
  const ch = detectPieceChange("un'altra gonna, più lunga", prev2, catOf)!;
  assert.deepEqual(ch.keepIds, ["top", "pumps", "bigBag"]);
  assert.deepEqual(applyPieceChange(["top2", "skirt2", "sandals"], ch, prev2, catOf), ["top", "pumps", "bigBag", "skirt2"]);
});
