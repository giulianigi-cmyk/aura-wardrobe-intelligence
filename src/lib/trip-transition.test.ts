// Run with: bun test src/lib/trip-transition.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { groupIntoOutfitStates, type ActivityForTransition } from "./trip-transition";

const act = (o: Partial<ActivityForTransition> & { activityId: string }): ActivityForTransition => ({
  daySegment: "day", dressCode: null, label: null, startTime: null, endTime: null, location: null, ...o,
});

test("trade-fair appointments one after another share one look, even without hours", () => {
  const groups = groupIntoOutfitStates([
    act({ activityId: "a", label: "Fiera GIMAV — stand Rossi", dressCode: "Business Casual" }),
    act({ activityId: "b", label: "Meeting cliente" }),
    act({ activityId: "c", label: "Riunione con fornitore" }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].activityIds.sort(), ["a", "b", "c"]);
});

test("two activities at the same place share one look", () => {
  const groups = groupIntoOutfitStates([
    act({ activityId: "a", label: "Visita", location: "Messe Düsseldorf" }),
    act({ activityId: "b", label: "Pranzo", location: "messe düsseldorf" }),
  ]);
  assert.equal(groups.length, 1);
});

test("a dinner inside an event that runs until 22:00 is the same look, with a small adjustment", () => {
  const groups = groupIntoOutfitStates([
    act({ activityId: "event", label: "Evento", startTime: "17:00", endTime: "22:00" }),
    act({ activityId: "dinner", label: "Cena", daySegment: "evening", startTime: "20:00", endTime: "22:00" }),
  ]);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].transitionNote);
});

test("a day at the fair and a dinner hours later are still two looks", () => {
  const groups = groupIntoOutfitStates([
    act({ activityId: "fair", label: "Fiera", startTime: "09:00", endTime: "17:00" }),
    act({ activityId: "dinner", label: "Cena", daySegment: "evening", startTime: "20:30", endTime: "23:00" }),
  ]);
  assert.equal(groups.length, 2);
  const noHours = groupIntoOutfitStates([
    act({ activityId: "museum", label: "Museo" }),
    act({ activityId: "walk", label: "Passeggiata" }),
  ]);
  assert.equal(noHours.length, 2, "unrelated activities without hours stay separate, as before");
});
