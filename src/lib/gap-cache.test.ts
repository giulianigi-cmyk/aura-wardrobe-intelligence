// Run with: bun test src/lib/gap-cache.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { GAP_CACHE_MS, gapSignature, readGapCache, writeGapCache } from "./gap-cache";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

test("the signature changes when a piece is added or edited", () => {
  const a = [{ id: "1", colors: ["Black"] }];
  assert.equal(gapSignature(a), gapSignature([{ id: "1", colors: ["Black"] }]));
  assert.notEqual(gapSignature(a), gapSignature([{ id: "1", colors: ["Navy"] }]));
  assert.notEqual(gapSignature(a), gapSignature([...a, { id: "2" }]));
});

test("the kept suggestion is used for the same wardrobe, for a day", () => {
  const now = 1_000_000;
  writeGapCache("u", "sig", { title: "Cappotto" }, now);
  assert.deepEqual(readGapCache("u", "sig", now + 1000), { title: "Cappotto" });
  assert.equal(readGapCache("u", "other", now + 1000), null);
  assert.equal(readGapCache("u", "sig", now + GAP_CACHE_MS + 1), null);
  assert.equal(readGapCache("someone-else", "sig", now), null);
});
