// Run with: bun test src/lib/weather-metno.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { metnoDaily, symbolToWmo, utcOffsetSeconds } from "./weather-metno";
import { isRainyCode } from "./weather-constants";

test("MET symbols map to WMO codes the rain rules understand", () => {
  assert.ok(isRainyCode(symbolToWmo("lightrain")));
  assert.ok(isRainyCode(symbolToWmo("heavyrainshowers_day")));
  assert.ok(isRainyCode(symbolToWmo("rainandthunder")));
  assert.equal(isRainyCode(symbolToWmo("partlycloudy_day")), false);
  assert.equal(symbolToWmo("clearsky_night"), 0);
});

test("hourly MET series → local days with max/min and a rainy code", () => {
  const ts = (iso: string, temp: number, symbol: string, mm = 0) => ({
    time: iso, data: { instant: { details: { air_temperature: temp } }, next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: mm } } },
  });
  const json = { properties: { timeseries: [
    ts("2026-10-12T05:00:00Z", 12, "cloudy"),        // 07:00 in Rome (+2)
    ts("2026-10-12T08:00:00Z", 16, "rain", 1.2),
    ts("2026-10-12T12:00:00Z", 19, "lightrain", 0.4),
    ts("2026-10-12T17:00:00Z", 15, "cloudy"),
  ] } };
  const days = metnoDaily(json, 7200);
  const d = days["2026-10-12"];
  assert.equal(d.tempMax, 19);
  assert.equal(d.tempMin, 12);
  assert.ok(isRainyCode(d.code));
  assert.ok(d.precipitation >= 50);
});

test("time zone offset includes daylight saving", () => {
  assert.equal(utcOffsetSeconds("Europe/Rome", new Date("2026-07-01T12:00:00Z")), 7200);
  assert.equal(utcOffsetSeconds("Europe/Rome", new Date("2026-01-15T12:00:00Z")), 3600);
});
