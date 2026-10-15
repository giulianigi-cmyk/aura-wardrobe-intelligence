import test from "node:test";
import assert from "node:assert/strict";
import { naturePairingRule, pairingLevelFor } from "./nature-color-pairings";

test("only people who like to experiment get the nature pairings", () => {
  assert.equal(naturePairingRule("Classic", "Weekend"), null);
  assert.equal(naturePairingRule("Balanced", "Weekend"), null);
  assert.equal(naturePairingRule(null, "Weekend"), null);
  assert.match(naturePairingRule("Creative", "Weekend") ?? "", /peacock/);
});

test("the occasion decides how far the pairing goes", () => {
  assert.equal(pairingLevelFor("Aperitivo con amiche"), "full");
  assert.equal(pairingLevelFor("Work · Fiera Glasstec"), "accent");
  assert.equal(pairingLevelFor("Matrimonio di Anna"), "accent");
  assert.equal(pairingLevelFor("Funerale"), "none");
  assert.equal(naturePairingRule("Bold", "Funerale"), null);
  assert.match(naturePairingRule("Bold", "Work · Fiera") ?? "", /ONE or two pieces/);
});
