// Run with: bun test src/lib/laundry-reminder-message.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { laundryReminderMessage } from "./laundry-reminder-message";

test("one notification for the dry cleaner and loans, nothing when there is nothing", () => {
  assert.equal(laundryReminderMessage("it", { dryCleaner: 0, loans: [] }), null);
  assert.equal(laundryReminderMessage("it", { dryCleaner: 2, loans: [{ piece: "Giacca nera", name: "Laura" }] })?.body,
    "Hai ritirato i 2 capi dalla tintoria? Giacca nera: l'avevi prestato a Laura. L'hai ripreso?");
  assert.equal(laundryReminderMessage("de", { dryCleaner: 1, loans: [] })?.body, "Did you collect the piece from the dry cleaner?");
});
