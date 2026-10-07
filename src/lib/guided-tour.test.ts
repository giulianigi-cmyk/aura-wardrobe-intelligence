// Run with: bun test src/lib/guided-tour.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { TOUR_STEPS, cardPlacement, shouldAutoStartTour, tourSeenKey } from "./guided-tour";

test("the tour starts on its own once, for a wardrobe still being built", () => {
  assert.equal(shouldAutoStartTour({ seen: false, pieces: 0 }), true);
  assert.equal(shouldAutoStartTour({ seen: false, pieces: 9 }), true);
  assert.equal(shouldAutoStartTour({ seen: false, pieces: 10 }), false);
  assert.equal(shouldAutoStartTour({ seen: true, pieces: 0 }), false);
});

test("the card sits away from the highlighted element", () => {
  assert.equal(cardPlacement({ top: 780, height: 60 }, 860), "above");
  assert.equal(cardPlacement({ top: 120, height: 300 }, 860), "below");
  assert.equal(cardPlacement(null, 860), "center");
});

test("one stop per tab, then Primi passi; the seen flag is per account", () => {
  assert.deepEqual(TOUR_STEPS.map((s) => s.target), ["tab-home", "tab-wardrobe", "tab-ai", "tab-planner", "tab-profile", "first-steps"]);
  assert.notEqual(tourSeenKey("a"), tourSeenKey("b"));
});
