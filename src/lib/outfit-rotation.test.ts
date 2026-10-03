// Run with: bun test src/lib/outfit-rotation.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { daysSince, recentlyWornIds, rotationOrder, rotationPriority, wearFields, withoutRecentPerCategory, type WearHistory } from "./outfit-rotation";

const TODAY = "2026-10-03";
const h = (lastWorn: string | null, wornCount = 0): WearHistory => ({ lastWorn, wornCount });

test("daysSince", () => {
  assert.equal(daysSince("2026-10-03", TODAY), 0);
  assert.equal(daysSince("2026-09-30T18:00:00Z", TODAY), 3);
  assert.equal(daysSince(null, TODAY), null);
  assert.equal(daysSince("garbage", TODAY), null);
});

test("never-worn and long-unworn pieces outrank recently worn ones", () => {
  assert.ok(rotationPriority(h(null), TODAY) > rotationPriority(h("2026-09-28"), TODAY));
  assert.ok(rotationPriority(h("2026-06-01"), TODAY) > rotationPriority(h("2026-09-20"), TODAY));
  // a favourite worn 30 times ranks below a piece worn once on the same day
  assert.ok(rotationPriority(h("2026-09-01", 30), TODAY) < rotationPriority(h("2026-09-01", 1), TODAY));
});

test("catalog order: newest-added-first input no longer keeps the recent pieces on top", () => {
  // input in "wardrobe order" (newest first): the recent pieces are the first 5
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}` }));
  const history = new Map<string, WearHistory>(items.map((it, i) => [it.id, i < 5 ? h("2026-10-02", 10) : h(i % 2 ? null : "2026-05-01")]));
  let recentInTop5 = 0;
  for (let run = 0; run < 200; run++) {
    const top5 = rotationOrder(items, history, TODAY).slice(0, 5).map((x) => x.id);
    recentInTop5 += top5.filter((id) => Number(id.slice(1)) < 5).length;
  }
  assert.ok(recentInTop5 / 200 < 0.5, `recent pieces in top 5: ${recentInTop5 / 200} on average`);
});

test("order varies between generations (random factor) and keeps every piece", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}` }));
  const history = new Map<string, WearHistory>(items.map((it) => [it.id, h("2026-08-01", 2)]));
  const a = rotationOrder(items, history, TODAY).map((x) => x.id).join();
  const b = rotationOrder(items, history, TODAY).map((x) => x.id).join();
  assert.notEqual(a, b);
  assert.equal(new Set(rotationOrder(items, history, TODAY).map((x) => x.id)).size, 30);
});

test("recently worn pieces are dropped per category, never emptying a category", () => {
  const items = [
    { id: "t1", category: "Tops" }, { id: "t2", category: "Tops" },
    { id: "b1", category: "Bottoms" },
    { id: "s1", category: "Shoes" }, { id: "s2", category: "Shoes" },
  ];
  const history = new Map<string, WearHistory>([["t1", h("2026-10-02")], ["b1", h("2026-10-03")], ["s1", h("2026-09-01")]]);
  const recent = recentlyWornIds(history, TODAY);
  assert.deepEqual([...recent].sort(), ["b1", "t1"]);
  const kept = withoutRecentPerCategory(items, recent).map((x) => x.id);
  assert.deepEqual(kept, ["t2", "b1", "s1", "s2"]); // t1 dropped; b1 kept: only bottom available
});

test("catalog fields", () => {
  assert.deepEqual(wearFields(h("2026-09-03", 4), TODAY), { lastWornDaysAgo: 30, timesWorn: 4 });
  assert.deepEqual(wearFields(undefined, TODAY), { lastWornDaysAgo: null, timesWorn: 0 });
});
