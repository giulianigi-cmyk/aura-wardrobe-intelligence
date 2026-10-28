// Run with: bun test src/lib/wishlist-savings.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { budgetPlan, monthlyQuestionDue, monthsLeft, openWishes, savingsBalance, savingsPlan, usualMonthlySaving, wishCostPerWear } from "./wishlist-savings";
import type { WardrobeItem } from "./aura-types";

const now = new Date(2026, 9, 28); // 28 October 2026
const wish = (id: string, priority: number, price: number | null, target: string | null, bought: string | null = null) =>
  ({ id, priority, price, currency: "EUR", target_date: target, bought_at: bought, created_at: "2026-10-01T00:00:00Z" });

test("savings balance adds what was saved and takes out what was spent, never below zero", () => {
  assert.equal(savingsBalance([
    { amount: 100, source: "monthly", entry_date: "2026-09-01" },
    { amount: 40, source: "sold", entry_date: "2026-10-02" },
    { amount: 30, source: "spent", entry_date: "2026-10-10" },
  ]), 110);
  assert.equal(savingsBalance([{ amount: 50, source: "spent", entry_date: "2026-10-10" }]), 0);
});

test("open wishes: bought ones out, in order of priority", () => {
  const list = openWishes([wish("b", 2, 10, null), wish("a", 1, 10, null), wish("c", 0, 10, null, "2026-10-20T00:00:00Z")]);
  assert.deepEqual(list.map((w) => w.id), ["a", "b"]);
});

test("months left counts the current month and is 0 once the date has passed", () => {
  assert.equal(monthsLeft("2026-10-31", now), 1);
  assert.equal(monthsLeft("2026-12-15", now), 3);
  assert.equal(monthsLeft("2027-01-01", now), 4);
  assert.equal(monthsLeft("2026-10-01", now), 0);
});

test("the plan spends the savings on the first priority, then spreads the rest over the months", () => {
  const plan = savingsPlan(
    [wish("watch", 0, 600, "2027-01-15"), wish("bag", 1, 300, "2026-12-20"), wish("ring", 2, 200, null)],
    [{ amount: 200, source: "monthly", entry_date: "2026-10-05" }],
    now,
  );
  const [watch, bag, ring] = plan.rows;
  assert.equal(watch.covered, 200);
  assert.equal(watch.remaining, 400);
  assert.equal(watch.months, 4);
  assert.equal(watch.monthly, 100);
  assert.equal(bag.covered, 0);
  assert.equal(bag.monthly, 100);
  assert.equal(ring.monthly, null);
  assert.equal(plan.monthlyTotal, 200);
  assert.equal(plan.usualMonthly, 200);
  assert.equal(plan.unrealistic, false);
});

test("unrealistic when a date has passed or the monthly amount is far above the usual", () => {
  assert.equal(savingsPlan([wish("x", 0, 100, "2026-09-01")], [], now).unrealistic, true);
  const plan = savingsPlan([wish("x", 0, 1000, "2026-11-30")], [{ amount: 100, source: "monthly", entry_date: "2026-09-03" }], now);
  assert.equal(plan.monthlyTotal, 450);
  assert.equal(plan.unrealistic, true);
});

test("usual monthly saving averages the last 3 months with any saving", () => {
  assert.equal(usualMonthlySaving([
    { amount: 50, source: "monthly", entry_date: "2026-06-01" },
    { amount: 100, source: "monthly", entry_date: "2026-08-01" },
    { amount: 60, source: "monthly", entry_date: "2026-09-01" },
    { amount: 40, source: "sold", entry_date: "2026-09-10" },
    { amount: 100, source: "monthly", entry_date: "2026-10-01" },
    { amount: 500, source: "spent", entry_date: "2026-10-02" },
  ], now), 100);
  assert.equal(usualMonthlySaving([], now), null);
});

test("the monthly question is asked once a month, only with something to save for", () => {
  assert.equal(monthlyQuestionDue(75, [], now), true);
  assert.equal(monthlyQuestionDue(75, [{ amount: 75, source: "monthly", entry_date: "2026-10-03" }], now), false);
  assert.equal(monthlyQuestionDue(0, [], now), false);
});

test("cost per wear: a watch is worn nearly every day, an evening dress a few times", () => {
  const watch = wishCostPerWear({ category: "Accessories", subcategory: "Watch", price: 1200, currency: "EUR" }, [], now);
  assert.ok(watch && watch.wearsPerYear >= 200, `watch ${watch?.wearsPerYear}`);
  const dress = wishCostPerWear({ category: "Dresses", subcategory: "Gown", formality: 5, occasion: "Black Tie", price: 1200, currency: "EUR" }, [] as WardrobeItem[], now);
  assert.ok(dress && dress.wearsPerYear <= 10, `dress ${dress?.wearsPerYear}`);
  assert.ok(dress!.costPerWearEur > watch!.costPerWearEur);
  assert.equal(wishCostPerWear({ category: "Bags", subcategory: null, price: 100 }, [], now), null);
});

test("with a fixed amount a month, each piece is reached in turn, in order of priority", () => {
  const rows = budgetPlan(
    [wish("bag", 0, 300, null), wish("scarf", 1, 50, null), wish("watch", 2, 1000, "2027-01-01"), wish("idea", 3, null, null)],
    [{ amount: 250, source: "sold", entry_date: "2026-10-02" }],
    100,
    now,
  );
  assert.deepEqual(rows.map((r) => [r.id, r.monthsAway, r.reachedOn]), [
    ["bag", 1, "2026-11-01"],
    ["scarf", 1, "2026-11-01"],
    ["watch", 11, "2027-09-01"],
    ["idea", null, null],
  ]);
  assert.equal(budgetPlan([wish("bag", 0, 300, null)], [{ amount: 300, source: "manual", entry_date: "2026-10-02" }], 0, now)[0].monthsAway, 0);
  assert.equal(budgetPlan([wish("bag", 0, 300, null)], [], 0, now)[0].monthsAway, null);
});
