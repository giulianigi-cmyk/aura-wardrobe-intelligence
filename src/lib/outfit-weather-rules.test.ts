// AURA — outfit-weather-rules: unit test
//
// COME ESEGUIRLI:
//   npx esbuild src/lib/outfit-weather-rules.test.ts --bundle --platform=node --format=esm --outfile=/tmp/owr-test.mjs
//   node /tmp/owr-test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { violatesWeatherRule, anyItemViolatesWeather, HOT_THRESHOLD_C, COLD_THRESHOLD_C } from "./outfit-weather-rules";

test("nessuna temperatura → mai violazione (nessuna opinione senza dati)", () => {
  assert.equal(violatesWeatherRule({ subcategory: "Sweater" }, null), false);
});

test("REGRESSIONE — maglione di lana con subcategory generica passa solo grazie al campo material", () => {
  // Prima del fix, il validator di Home non guardava affatto `material` —
  // esattamente il caso che ha causato il bug segnalato.
  const item = { category: "Tops", subcategory: "Knitwear", material: ["Wool"], styleTags: [] };
  assert.equal(violatesWeatherRule(item, 30), true, "un capo di lana a 30°C deve essere escluso anche senza la parola 'sweater' nel subcategory");
});

test("REGRESSIONE — season multi-valore 'Autumn, Winter' deve matchare con .includes(), non ===", () => {
  const item = { category: "Bottoms", subcategory: "Trousers", season: "Autumn, Winter", material: [] };
  assert.equal(violatesWeatherRule(item, HOT_THRESHOLD_C), true);
});

test("capo leggero a temperatura calda → non viola", () => {
  const item = { category: "Tops", subcategory: "Tank Top", material: ["Cotton"], season: "Summer" };
  assert.equal(violatesWeatherRule(item, 30), false);
});

test("scarpa open toe con freddo → viola", () => {
  const item = { category: "Shoes", subcategory: "Sandals", toeShape: "Open Toe" };
  assert.equal(violatesWeatherRule(item, COLD_THRESHOLD_C), true);
});

test("capo leggero (season summer) con freddo → viola", () => {
  const item = { category: "Tops", subcategory: "Tank Top", season: "Summer" };
  assert.equal(violatesWeatherRule(item, 5), true);
});

test("temperatura mite (né calda né fredda) → mai violazione", () => {
  const item = { category: "Tops", subcategory: "Sweater", material: ["Wool"] };
  assert.equal(violatesWeatherRule(item, 18), false);
});

test("anyItemViolatesWeather: un solo capo su più id che viola basta a far scattare true", () => {
  const catalog = [
    { id: "a", category: "Tops", subcategory: "Tank Top" },
    { id: "b", category: "Outerwear", subcategory: "Coat", material: ["Wool"] },
  ];
  assert.equal(anyItemViolatesWeather(["a", "b"], catalog, 30), true);
  assert.equal(anyItemViolatesWeather(["a"], catalog, 30), false);
});

test("id non trovato nel catalog → ignorato, non crasha", () => {
  const catalog = [{ id: "a", category: "Tops" }];
  assert.equal(anyItemViolatesWeather(["missing-id"], catalog, 30), false);
});

test("un cappotto vero solo da 10 °C in giù; trench e giacche restano anche sopra", async () => {
  const { isHeavyCoat } = await import("./outfit-weather-rules");
  const coat = { category: "Outerwear", subcategory: "Coat", material: ["Wool"] };
  assert.equal(violatesWeatherRule(coat, 10), false);
  assert.equal(violatesWeatherRule(coat, 7), false);
  assert.equal(violatesWeatherRule(coat, 11), true);
  assert.equal(violatesWeatherRule(coat, 17), true);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Puffer Jacket" }, 14), true);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Trench Coat" }, 14), false);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Leather Jacket" }, 14), false);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Blazer" }, 14), false);
  assert.equal(isHeavyCoat({ category: "Outerwear", subcategory: "Rain Jacket" }), false);
});

test("anche la giacca di lana solo da 10 °C in giù; il blazer di lana resta", () => {
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Shacket", material: ["Wool"] }, 14), true);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Shacket", material: ["Wool"] }, 9), false);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Blazer", material: ["Wool"] }, 14), false);
  assert.equal(violatesWeatherRule({ category: "Outerwear", subcategory: "Denim Jacket", material: ["Cotton"] }, 14), false);
});

test("10–17 °C: pelle, imbottiti leggeri e piumini smanicati sì; sopra 17 °C niente imbottiti", () => {
  const puffy = { category: "Outerwear", subcategory: "Puffer Jacket", length: "Long" };
  const lightPuffer = { category: "Outerwear", subcategory: "Puffer Jacket", length: "Short" };
  const pufferVest = { category: "Outerwear", subcategory: "Vest", material: ["Down"] };
  const leather = { category: "Outerwear", subcategory: "Leather Jacket", material: ["Leather"] };
  assert.equal(violatesWeatherRule(puffy, 14), true);
  assert.equal(violatesWeatherRule(lightPuffer, 14), false);
  assert.equal(violatesWeatherRule(pufferVest, 14), false);
  assert.equal(violatesWeatherRule(leather, 14), false);
  assert.equal(violatesWeatherRule(lightPuffer, 19), true);
  assert.equal(violatesWeatherRule(pufferVest, 19), true);
  assert.equal(violatesWeatherRule(leather, 19), false);
  assert.equal(violatesWeatherRule(puffy, 8), false);
});

test("temperatura del capospalla: percepita, ora più fredda fuori casa, sensibilità della persona", async () => {
  const { outerLayerTemperature, forPerson, isLeatherJacket } = await import("./outfit-weather-rules");
  // 12 °C con vento che sembrano 8: conta la percepita.
  assert.equal(outerLayerTemperature({ temperature: 12, apparentTemperature: 8 }), 8);
  // Mattina fresca, pomeriggio caldo: alle 8 si esce con il fresco del mattino.
  const morning = outerLayerTemperature({ temperature: 9, apparentTemperature: 9, tempMin: 8, tempMax: 18, localHour: 8 })!;
  assert.ok(morning <= 9);
  // Nel pomeriggio non conta più il freddo del mattino, ma la sera sì.
  const afternoon = outerLayerTemperature({ temperature: 18, apparentTemperature: 18, tempMin: 8, tempMax: 18, localHour: 15 })!;
  assert.ok(afternoon < 18 && afternoon > morning);
  assert.equal(forPerson(13, "cold"), 10);
  assert.equal(forPerson(13, "warm"), 16);
  assert.equal(forPerson(13, null), 13);
  // Freddolosa a 13 °C: il cappotto va bene; normale no.
  const coat = { category: "Outerwear", subcategory: "Coat", material: ["Wool"] };
  assert.equal(violatesWeatherRule(coat, 13, forPerson(13, "cold")), false);
  assert.equal(violatesWeatherRule(coat, 13, 13), true);
  // Giacca di pelle: no da 22 °C.
  const leather = { category: "Outerwear", subcategory: "Leather Jacket" };
  assert.equal(isLeatherJacket(leather), true);
  assert.equal(violatesWeatherRule(leather, 22), true);
  assert.equal(violatesWeatherRule(leather, 19), false);
});

test("alle 8 con 12 °C reali la stima parte dai 12, non dalla curva (che direbbe 9)", async () => {
  const { outerLayerTemperature } = await import("./outfit-weather-rules");
  const t = outerLayerTemperature({ temperature: 12, apparentTemperature: 12, tempMin: 8, tempMax: 17, localHour: 8.1 })!;
  assert.ok(t >= 11.5, `outer ${t}`);
});
