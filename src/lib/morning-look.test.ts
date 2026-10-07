// Run with: bun test src/lib/morning-look.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { MORNING_TIMES, isDue, localClock, morningMessage, morningTimeOf } from "./morning-look";

test("times every 15 minutes from 05:00 to 12:00; anything else falls back to 07:30", () => {
  assert.equal(MORNING_TIMES[0], "05:00");
  assert.equal(MORNING_TIMES.at(-1), "12:00");
  assert.equal(MORNING_TIMES.length, 29);
  assert.equal(morningTimeOf({ morning_look_time: "06:45" }), "06:45");
  assert.equal(morningTimeOf({ morning_look_time: "06:44" }), "07:30");
  assert.equal(morningTimeOf(null), "07:30");
});

test("the clock is read in the person's own time zone", () => {
  const now = new Date("2026-10-08T05:40:00Z");
  assert.deepEqual(localClock(now, "Europe/Rome"), { date: "2026-10-08", minutes: 7 * 60 + 40 });
  assert.deepEqual(localClock(now, "America/New_York"), { date: "2026-10-08", minutes: 1 * 60 + 40 });
  assert.deepEqual(localClock(new Date("2026-10-07T23:30:00Z"), "Asia/Tokyo"), { date: "2026-10-08", minutes: 8 * 60 + 30 });
});

test("due from the chosen time for half an hour", () => {
  assert.equal(isDue("07:30", 7 * 60 + 29), false);
  assert.equal(isDue("07:30", 7 * 60 + 30), true);
  assert.equal(isDue("07:30", 7 * 60 + 59), true);
  assert.equal(isDue("07:30", 8 * 60), false);
});

test("the message is in the person's language, with the day's weather when known", () => {
  assert.deepEqual(morningMessage("it", { min: 9, max: 16, rainChance: 70 }), { title: "Il tuo look di oggi è pronto", body: "Oggi tra 9° e 16°, possibile pioggia. Apri AURA per vedere cosa indossare." });
  assert.equal(morningMessage("fr", { min: 9, max: 16, rainChance: 10 }).body, "Aujourd'hui entre 9° et 16°. Ouvrez AURA pour voir quoi porter.");
  assert.equal(morningMessage("de", null).title, "Today's look is ready");
  assert.equal(morningMessage(null, null).body, "Open AURA to see what to wear.");
});
