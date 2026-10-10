// Run with: bun test src/lib/problem-reports.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { newReportEmail, parseAdminIds, reportUpdateMessage } from "./problem-reports";

test("admin ids: only well-formed ids are kept", () => {
  const ids = parseAdminIds(" 32ff3367-afb3-4229-9960-cdcb882961cd , nope,");
  assert.deepEqual([...ids], ["32ff3367-afb3-4229-9960-cdcb882961cd"]);
  assert.equal(parseAdminIds(undefined).size, 0);
});

test("owner email: the message and where, never personal data", () => {
  const e = newReportEmail({ id: 7, message: "Il pulsante non va\naltro", screen: "wardrobe", platform: "ios-app", username: "ele", createdAt: "2026-10-10T08:00:00Z" });
  assert.match(e.subject, /#7: Il pulsante non va$/);
  assert.match(e.text, /@ele/);
  assert.match(e.text, /Schermata: wardrobe/);
});

test("update to the person: status and reply in their language", () => {
  const m = reportUpdateMessage("it", "fixed", "Corretto nella nuova versione");
  assert.equal(m.title, "Aggiornamento sulla tua segnalazione");
  assert.equal(m.body, "Risolta.\nRisposta: Corretto nella nuova versione");
  assert.equal(reportUpdateMessage("de", "in_progress", null).body, "In progress.");
});
