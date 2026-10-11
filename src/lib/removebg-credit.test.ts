// Run with: bun test src/lib/removebg-credit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { REMOVEBG_ALERT_EVERY_MS, REMOVEBG_PAUSE_MS, removeBgPausedAt, removeBgShouldAlert } from "./removebg-credit";

const now = Date.parse("2026-10-11T12:00:00Z");

test("remove.bg never out of credits: not paused", () => {
  assert.equal(removeBgPausedAt(null, now), false);
});
test("remove.bg paused right after an out-of-credits answer", () => {
  assert.equal(removeBgPausedAt(now - 60_000, now), true);
});
test("remove.bg tried again once the pause is over", () => {
  assert.equal(removeBgPausedAt(now - REMOVEBG_PAUSE_MS, now), false);
});
test("remove.bg alert: first time yes", () => {
  assert.equal(removeBgShouldAlert(null, now), true);
});
test("remove.bg alert: not again within the week", () => {
  assert.equal(removeBgShouldAlert(now - 6 * 60 * 60 * 1000, now), false);
});
test("remove.bg alert: again after a week", () => {
  assert.equal(removeBgShouldAlert(now - REMOVEBG_ALERT_EVERY_MS, now), true);
});
