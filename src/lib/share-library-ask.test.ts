// Run with: bun test src/lib/share-library-ask.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { snoozeShareAsk, snoozedRecently } from "./share-library-ask";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

test("after «Non ora» the question waits 30 days, per person", () => {
  const day = 86_400_000;
  assert.equal(snoozedRecently("u", 0 + day), false);
  snoozeShareAsk("u", day);
  assert.equal(snoozedRecently("u", day * 10), true);
  assert.equal(snoozedRecently("u", day * 32), false);
  assert.equal(snoozedRecently("v", day * 10), false);
});
