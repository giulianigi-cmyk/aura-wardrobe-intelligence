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

test("the pieces «forse da lavare» join the same notification", () => {
  assert.equal(laundryReminderMessage("it", { dryCleaner: 0, loans: [], due: 3 })?.body, "3 capi che hai indossato sono forse da lavare: li metti nel cesto?");
  assert.equal(laundryReminderMessage("en", { dryCleaner: 1, loans: [], due: 1 })?.body,
    "Did you collect the piece from the dry cleaner? A piece you wore may need washing: into the basket?");
});
