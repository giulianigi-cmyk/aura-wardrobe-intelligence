// Run with: bun test src/lib/weather-change-message.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { pieceLabel, weatherChangeMessage } from "./weather-change-message";

test("the weather-change notification is written in the person's language", () => {
  const m = weatherChangeMessage("it", {
    dateIso: "2026-10-12", weatherKey: "weather.showers", tempMax: 18, precipitation: 70, umbrellaThreshold: 50,
    dropped: [pieceLabel("it", { category: "Shoes", brand: "Le Silla" })!], added: [pieceLabel("it", { category: "Shoes", brand: "Christian Louboutin" })!],
  });
  assert.equal(m.title, "Il meteo è cambiato per l'outfit di lunedì");
  assert.match(m.body, /^Rovesci in arrivo: scarpe Le Silla/);
  assert.match(m.body, /Ti suggerisco invece: scarpe Christian Louboutin\./);
  assert.match(m.body, /70% di probabilità di pioggia/);
});

test("unknown languages fall back to English", () => {
  const m = weatherChangeMessage("de", { dateIso: "2026-10-12", weatherKey: "weather.rain", tempMax: 12, precipitation: 10, umbrellaThreshold: 50, dropped: [], added: [] });
  assert.equal(m.title, "Weather changed for your Monday outfit");
  assert.equal(m.body, "Rain expected, around 12°.");
});
