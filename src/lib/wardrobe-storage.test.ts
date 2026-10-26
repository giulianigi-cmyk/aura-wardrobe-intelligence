import test from "node:test";
import assert from "node:assert/strict";
import { isInStorage, isWearableNow } from "./wardrobe-storage";

test("a piece put away in the cambio armadio is not wearable", () => {
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
