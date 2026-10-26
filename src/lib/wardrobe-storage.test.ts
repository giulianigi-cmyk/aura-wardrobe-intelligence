import test from "node:test";
import assert from "node:assert/strict";
import { isInStorage, isWearableNow } from "./wardrobe-storage";

test("a piece put away in the cambio stagione is not wearable", () => {
  assert.equal(isInStorage({ stored_at: "2026-10-26T08:00:00Z" }), true);
  assert.equal(isWearableNow({ stored_at: "2026-10-26T08:00:00Z" }), false);
});

test("a piece in the wardrobe, or read before the column existed, is wearable", () => {
  assert.equal(isWearableNow({ stored_at: null }), true);
  assert.equal(isWearableNow({}), true);
  assert.equal(isInStorage({}), false);
});

test("archived and loaned pieces stay excluded", () => {
  assert.equal(isWearableNow({ archived: true }), false);
  assert.equal(isWearableNow({ active_loan_id: "x" }), false);
});

import { seasonsForTemperatures, storedPiecesForSeasons } from "./wardrobe-storage";

test("a hot trip asks for the summer pieces put away, a cold one for the winter pieces", () => {
  const stored = "2026-10-01T00:00:00Z";
  const items = [
    { id: "swim", season: "Summer", stored_at: stored },
    { id: "down", season: "Winter", stored_at: stored },
    { id: "linen", season: "Spring, Summer", stored_at: stored },
    { id: "home", season: "Summer", stored_at: null },
    { id: "untagged", season: "", stored_at: stored },
    { id: "sold", season: "Summer", stored_at: stored, archived: true },
  ];
  const maldives = storedPiecesForSeasons(items, seasonsForTemperatures([30, 31, 29]));
  assert.deepEqual(maldives.map((i) => i.id), ["swim", "linen"]);
  const lapland = storedPiecesForSeasons(items, seasonsForTemperatures([-5, -2]));
  assert.deepEqual(lapland.map((i) => i.id), ["down"]);
  assert.deepEqual(storedPiecesForSeasons(items, new Set()), []);
});

import { seasonChangeSuggestions } from "./wardrobe-storage";

test("cosa mettere via: summer pieces go away in a cold fortnight, winter pieces come back", () => {
  const stored = "2026-06-01T00:00:00Z";
  const items = [
    { id: "linen", season: "Summer" },
    { id: "sandals", season: "Summer", last_worn: "2026-10-20" },
    { id: "swim", season: "Summer" },
    { id: "trench", season: "Spring, Autumn" },
    { id: "tee", season: "All Seasons" },
    { id: "untagged", season: "" },
    { id: "coat", season: "Winter", stored_at: stored },
    { id: "beach", season: "Summer", stored_at: stored },
    { id: "lent", season: "Summer", active_loan_id: "l1" },
  ];
  const plan = seasonChangeSuggestions(items, [12, 11, 9, 13, 10], { today: "2026-10-26", plannedIds: new Set(["swim"]) });
  assert.deepEqual(plan.putAway.map((i) => i.id), ["linen"]);
  assert.deepEqual(plan.keepOut.map((k) => [k.item.id, k.reason]), [["sandals", "recent"], ["swim", "planned"]]);
  assert.deepEqual(plan.bringBack.map((i) => i.id), ["coat"]);
});

test("a warm late October (22° and up) keeps summer pieces out, and no forecast suggests nothing", () => {
  const items = [{ id: "linen", season: "Summer" }];
  assert.deepEqual(seasonChangeSuggestions(items, [23, 21, 22], { today: "2026-10-26", plannedIds: new Set() }).putAway, []);
  assert.deepEqual(seasonChangeSuggestions(items, [], { today: "2026-10-26", plannedIds: new Set() }).putAway, []);
});
