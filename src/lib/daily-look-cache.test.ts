// Run with: bun test src/lib/daily-look-cache.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { cachedLooksStillFresh, lookFingerprint } from "./daily-look-cache";

const ids = new Set(["a", "b", "c", "d"]);
const row = { date: "2026-10-11", fingerprint: lookFingerprint(100, "mild"), itemIds: ["a", "b", "c"] };
const now = { today: "2026-10-11", activeCount: 100, tempBand: "mild", availableIds: ids };

test("adding or editing a few pieces keeps today's looks (no new AI call)", () => {
  assert.equal(cachedLooksStillFresh(row, { ...now, activeCount: 103 }), true);
  // old-format key with a latest-edit timestamp still parses
  assert.equal(cachedLooksStillFresh({ ...row, fingerprint: "100:2026-10-10T08:00:00Z:mild" }, now), true);
});

test("regenerated for a new day, a new temperature band, a missing piece or a much bigger wardrobe", () => {
  assert.equal(cachedLooksStillFresh(row, { ...now, today: "2026-10-12" }), false);
  assert.equal(cachedLooksStillFresh(row, { ...now, tempBand: "hot" }), false);
  assert.equal(cachedLooksStillFresh({ ...row, itemIds: ["a", "z"] }, now), false);
  assert.equal(cachedLooksStillFresh(row, { ...now, activeCount: 130 }), false);
  assert.equal(cachedLooksStillFresh({ ...row, fingerprint: lookFingerprint(8, "mild") }, { ...now, activeCount: 10 }), false);
});

test("the looks' texts follow the language: switching language regenerates them once", () => {
  const it = { ...row, fingerprint: lookFingerprint(100, "mild", "it") };
  assert.equal(cachedLooksStillFresh(it, { ...now, language: "it" }), true);
  assert.equal(cachedLooksStillFresh(it, { ...now, language: "en" }), false);
  assert.equal(cachedLooksStillFresh({ ...row, fingerprint: lookFingerprint(100, "mild", "en-US") }, { ...now, language: "en" }), true);
  // a row saved before the language was in the key: its language is unknown, so it is redone once
  assert.equal(cachedLooksStillFresh(row, { ...now, language: "en" }), false);
  assert.equal(cachedLooksStillFresh(it, { ...now, tempBand: "hot", language: "it" }), false);
});
