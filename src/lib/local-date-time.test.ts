// Run with: bun test src/lib/local-date-time.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { localDateTime } from "./local-date-time";

test("a calendar event keeps its local date and hour in the person's time zone", () => {
  // 07:30 UTC on 22 October is 09:30 in Rome (summer time).
  assert.deepEqual(localDateTime("2026-10-22T07:30:00Z", "Europe/Rome"), { date: "2026-10-22", time: "09:30" });
  // 23:00 UTC is already the next day in Rome.
  assert.deepEqual(localDateTime("2026-10-22T23:00:00Z", "Europe/Rome"), { date: "2026-10-23", time: "01:00" });
});

test("without a time zone, or with an unknown one, UTC is used", () => {
  assert.deepEqual(localDateTime("2026-10-22T07:30:00Z"), { date: "2026-10-22", time: "07:30" });
  assert.deepEqual(localDateTime("2026-10-22T07:30:00Z", "Not/AZone"), { date: "2026-10-22", time: "07:30" });
});
