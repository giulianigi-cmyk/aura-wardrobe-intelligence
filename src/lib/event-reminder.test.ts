// Run with: bun test src/lib/event-reminder.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { EVENING_TIMES, eveningTimeOf, eventReminderMessage, eventsOn, nextDate } from "./event-reminder";

test("evening times every 15 minutes from 17:00 to 22:00, 20:00 by default", () => {
  assert.equal(EVENING_TIMES[0], "17:00");
  assert.equal(EVENING_TIMES.at(-1), "22:00");
  assert.equal(eveningTimeOf({ event_reminder_time: "21:15" }), "21:15");
  assert.equal(eveningTimeOf({ event_reminder_time: "07:30" }), "20:00");
});

test("tomorrow across month and year ends", () => {
  assert.equal(nextDate("2026-10-31"), "2026-11-01");
  assert.equal(nextDate("2026-12-31"), "2027-01-01");
  assert.equal(nextDate("2028-02-28"), "2028-02-29");
});

test("tomorrow's appointments in the person's time zone, in order; all-day keeps its date", () => {
  const events = [
    { title: "Cena da Marco", start_time: "2026-10-09T18:00:00Z", all_day: false },
    { title: "Riunione", start_time: "2026-10-09T07:30:00Z", all_day: false },
    { title: "Compleanno Anna", start_time: "2026-10-09T00:00:00Z", all_day: true },
    { title: "Late", start_time: "2026-10-09T22:30:00Z", all_day: false }, // 00:30 on the 10th in Rome
    { title: "Oggi", start_time: "2026-10-08T15:00:00Z", all_day: false },
  ];
  assert.deepEqual(eventsOn(events, "2026-10-09", "Europe/Rome"), [
    { title: "Compleanno Anna", time: null },
    { title: "Riunione", time: "09:30" },
    { title: "Cena da Marco", time: "20:00" },
  ]);
  assert.deepEqual(eventsOn(events, "2026-10-09", "America/New_York").map((e) => e.title), ["Compleanno Anna", "Riunione", "Cena da Marco", "Late"]);
});

test("the message names the appointment, or counts them", () => {
  assert.deepEqual(eventReminderMessage("it", [{ title: "Cena da Marco", time: "20:00" }]), { title: "Domani: Cena da Marco", body: "Alle 20:00. Cosa indossi? Tocca e chiedi allo Stylist." });
  assert.deepEqual(eventReminderMessage("it", [{ title: null, time: null }]), { title: "Domani: un impegno", body: "Cosa indossi? Tocca e chiedi allo Stylist." });
  assert.deepEqual(eventReminderMessage("en", [{ title: "Standup", time: "09:00" }, { title: "Dinner", time: "20:00" }]), { title: "You have 2 plans tomorrow", body: "Standup at 09:00 and 1 more. What will you wear? Tap to ask your Stylist." });
  assert.equal(eventReminderMessage("it", []), null);
});
