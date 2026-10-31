// Run with: bun test src/lib/device-language.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deviceLanguage } from "./device-language";

test("the phone's first language Nimbèa speaks; else Italian on nimbea.it, English elsewhere", () => {
  assert.equal(deviceLanguage(["it-IT", "en-US"]), "it");
  assert.equal(deviceLanguage(["de-DE", "fr-FR"]), "fr");
  assert.equal(deviceLanguage(["zh-Hans-CN"]), "zh");
  assert.equal(deviceLanguage(["de-DE"], "nimbea.it"), "it");
  assert.equal(deviceLanguage(["de-DE"], "nimbea.app"), "en");
  assert.equal(deviceLanguage([], "www.nimbea.it"), "it");
});
