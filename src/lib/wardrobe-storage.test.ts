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
