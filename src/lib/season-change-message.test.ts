import test from "node:test";
import assert from "node:assert/strict";
import { seasonChangeMessage, seasonChangeWorthTelling } from "./season-change-message";

test("only worth a notification with at least five pieces to move", () => {
  assert.equal(seasonChangeWorthTelling(4, 4), false);
  assert.equal(seasonChangeWorthTelling(5, 0), true);
  assert.equal(seasonChangeWorthTelling(0, 7), true);
});

test("the message names the temperatures and the counts, in the person's language", () => {
  const it = seasonChangeMessage("it", { putAway: 12, bringBack: 8, minHigh: 9, maxHigh: 14 });
  assert.equal(it.body, "Nelle prossime due settimane massime tra 9° e 14°: 12 capi da spostare nel cambio stagione e 8 da riprendere. Tocca per vederli.");
  const en = seasonChangeMessage("de", { putAway: 6, bringBack: 0, minHigh: 25, maxHigh: 30 });
  assert.equal(en.body, "Highs between 25° and 30° over the next two weeks: 6 pieces to move to seasonal storage. Tap to see them.");
});
