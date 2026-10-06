// Run with: bun test src/lib/plans.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { effectivePlan, isOver, isValidTimeZone, periodStart } from "./plans";

test("no plan row is FREE; a FREE person inside the trial gets ULTRA; after it, FREE again", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  assert.deepEqual(effectivePlan(null, now), { plan: "free", inTrial: false });
  assert.deepEqual(effectivePlan({ plan: "free", trial_ends_at: "2026-10-08T12:00:00Z", time_zone: null }, now), { plan: "ultra", inTrial: true });
  assert.deepEqual(effectivePlan({ plan: "free", trial_ends_at: "2026-10-05T12:00:00Z", time_zone: null }, now), { plan: "free", inTrial: false });
  assert.deepEqual(effectivePlan({ plan: "owner", trial_ends_at: null, time_zone: null }, now), { plan: "owner", inTrial: false });
  assert.deepEqual(effectivePlan({ plan: "plus", trial_ends_at: "2026-10-08T12:00:00Z", time_zone: null }, now), { plan: "plus", inTrial: false });
});

test("the day starts at local midnight in the person's time zone (summer and winter time)", () => {
  // 00:30 in Rome on 6 Oct (CEST, UTC+2) is still 5 Oct in UTC.
  const p = periodStart("day", new Date("2026-10-05T22:30:00Z"), "Europe/Rome")!;
  assert.equal(p.date, "2026-10-06");
  assert.equal(p.at.toISOString(), "2026-10-05T22:00:00.000Z");
  const w = periodStart("day", new Date("2026-12-10T10:00:00Z"), "Europe/Rome")!;
  assert.equal(w.at.toISOString(), "2026-12-09T23:00:00.000Z"); // CET, UTC+1
  const ny = periodStart("day", new Date("2026-10-06T02:00:00Z"), "America/New_York")!;
  assert.equal(ny.date, "2026-10-05");
  assert.equal(ny.at.toISOString(), "2026-10-05T04:00:00.000Z");
});

test("the month starts on the 1st at local midnight; per-request limits have no period", () => {
  const m = periodStart("month", new Date("2026-10-06T12:00:00Z"), "Europe/Rome")!;
  assert.equal(m.date, "2026-10-01");
  assert.equal(m.at.toISOString(), "2026-09-30T22:00:00.000Z");
  assert.equal(periodStart("request", new Date(), "Europe/Rome"), null);
});

test("an unknown time zone falls back to Rome", () => {
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone("Europe/Paris"), true);
  const p = periodStart("day", new Date("2026-10-05T22:30:00Z"), "Not/AZone")!;
  assert.equal(p.date, "2026-10-06");
});

test("over the limit: NULL never, 0 on any use, otherwise only past the number", () => {
  assert.equal(isOver(1000, null), false);
  assert.equal(isOver(1, 0), true);
  assert.equal(isOver(0, 0), false);
  assert.equal(isOver(10, 10), false);
  assert.equal(isOver(11, 10), true);
});
