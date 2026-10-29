// Run with: bun test src/lib/laundry-basket.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { basketExpired, dryCleanerOverdue, dryCleanerPushDay, isInLaundry, isSportPiece, loanPushDay, loanReminderDue } from "./laundry-basket";

const now = Date.parse("2026-11-20T08:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

test("a basket piece is out for 10 days, then back on its own", () => {
  assert.equal(isInLaundry({ laundry_since: daysAgo(3), laundry_kind: "basket" }, now), true);
  assert.equal(isInLaundry({ laundry_since: daysAgo(10), laundry_kind: "basket" }, now), false);
  assert.equal(basketExpired({ laundry_since: daysAgo(10), laundry_kind: "basket" }, now), true);
  assert.equal(isInLaundry({}, now), false);
});

test("the dry cleaner never comes back on its own: asked on day 7, then every 3 days", () => {
  const at = (d: number) => ({ laundry_since: daysAgo(d), laundry_kind: "dry_cleaner" });
  assert.equal(isInLaundry(at(30), now), true);
  assert.equal(basketExpired(at(30), now), false);
  assert.equal(dryCleanerOverdue(at(6), now), false);
  assert.equal(dryCleanerOverdue(at(7), now), true);
  assert.deepEqual([6, 7, 8, 9, 10, 13].map((d) => dryCleanerPushDay(at(d), now)), [false, true, false, false, true, true]);
});

test("a loan is asked about 14 days after it, then 14 days after each 'still has it'", () => {
  const loan = { loaned_at: daysAgo(14).slice(0, 10) };
  assert.equal(loanReminderDue({ loaned_at: daysAgo(13) }, now), false);
  assert.equal(loanReminderDue(loan, now), true);
  assert.equal(loanPushDay({ loaned_at: daysAgo(14) }, now), true);
  // answered "ce l'ha ancora" 5 days ago: next question in 9 days
  assert.equal(loanReminderDue({ loaned_at: daysAgo(30), updated_at: daysAgo(5) }, now), false);
  assert.equal(loanPushDay({ loaned_at: daysAgo(30), updated_at: daysAgo(14) }, now), true);
  assert.equal(loanReminderDue({ loaned_at: daysAgo(30), returned_at: daysAgo(1) }, now), false);
});

test("sport pieces", () => {
  assert.equal(isSportPiece({ category: "Activewear" }), true);
  assert.equal(isSportPiece({ category: "Tops", occasion: "Sport, Gym" }), true);
  assert.equal(isSportPiece({ category: "Tops", occasion: "Sport, Weekend" }), false);
});
