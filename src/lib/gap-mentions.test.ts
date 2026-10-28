// Run with: bun test src/lib/gap-mentions.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { mentionedPieces, namedFirst } from "./gap-mentions";

const items = [
  { id: "trousers", brand: "Scotch & Soda", model: null },
  { id: "jeans", brand: "Levi's", model: "501" },
  { id: "tee", brand: "Levi's", model: "Housemark" },
  { id: "coat", brand: "Max Mara", model: "101801" },
];

test("a piece named by brand in the reason counts as named", () => {
  const reason = "Perfetto da abbinare ai tuoi pantaloni verde smeraldo di Scotch & Soda per un look ricercato.";
  assert.deepEqual(mentionedPieces(reason, [], items, new Set(["trousers", "jeans"])), ["trousers"]);
});

test("ids from the model come first and must exist", () => {
  assert.deepEqual(mentionedPieces("Con il tuo cappotto.", ["coat", "ghost", "coat"], items, new Set()), ["coat"]);
});

test("a brand shared by several pieces needs the model, or a single eligible piece", () => {
  assert.deepEqual(mentionedPieces("Con i tuoi Levi's 501.", [], items, new Set()), ["jeans"]);
  assert.deepEqual(mentionedPieces("Con i tuoi Levi's.", [], items, new Set(["jeans"])), ["jeans"]);
  assert.deepEqual(mentionedPieces("Con i tuoi Levi's.", [], items, new Set(["jeans", "tee"])), []);
});

test("named pieces lead the list, without duplicates, up to the limit", () => {
  assert.deepEqual(namedFirst(["trousers"], ["a", "trousers", "b", "c"], 3), ["trousers", "a", "b"]);
});
