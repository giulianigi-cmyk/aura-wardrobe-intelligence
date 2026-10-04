// Run with: bun test src/lib/commute-weather.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { commuteWeather, temperatureAt } from "./commute-weather";

test("the curve: minimum at dawn, maximum mid-afternoon", () => {
  assert.equal(Math.round(temperatureAt(6, 13, 27)), 13);
  assert.equal(Math.round(temperatureAt(15, 13, 27)), 27);
  assert.ok(temperatureAt(8.5, 13, 27) < 17);
});

test("reported case: 13° leaving at 8:30, 27° in the afternoon → a removable layer", () => {
  const c = commuteWeather("09:00", "18:00", 13, 27)!;
  assert.equal(c.leaveAt, "08:30");
  assert.ok(c.leaveTemp <= 16, String(c.leaveTemp));
  assert.equal(c.needsRemovableLayer, true);
});

test("a steadily warm or steadily cool day needs no extra layer", () => {
  assert.equal(commuteWeather("09:00", "18:00", 22, 28)!.needsRemovableLayer, false);
  assert.equal(commuteWeather("09:00", "18:00", 6, 11)!.needsRemovableLayer, false);
});
