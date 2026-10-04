// Run with: bun test src/lib/purchase-reason.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readReason } from "./purchase-advisor.functions";

test("the stylist reason is read even when the model breaks the JSON with quotes", () => {
  assert.equal(readReason('{"reason": "Prendi i sandali Rene Caovilla."}'), "Prendi i sandali Rene Caovilla.");
  assert.equal(readReason('```json\n{"reason": "Inizia con i sandali "Ellabrita": sono diversi dai tuoi."}\n```'), 'Inizia con i sandali "Ellabrita": sono diversi dai tuoi.');
  assert.equal(readReason('Ecco: {"reason": "Primo: le \\"Cleo\\"."}'), 'Primo: le "Cleo".');
  assert.equal(readReason("Nessun JSON qui"), null);
  assert.equal(readReason('{"reason": ""}'), null);
});
