import test from "node:test";
import assert from "node:assert/strict";
import { naturePairingRule, pairingLevelFor, colourPlayGapRule, editorialPairingRule } from "./nature-color-pairings";

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

test("Parisian colour-play: full on a free day, polished at work; gap suggestions only for experimenters", () => {
  assert.match(naturePairingRule("Creative", "Brunch") ?? "", /print mixing/);
  assert.doesNotMatch(naturePairingRule("Creative", "Work · Fiera") ?? "", /print mixing/);
  assert.match(naturePairingRule("Creative", "Work · Fiera") ?? "", /colour suit/);
  assert.equal(colourPlayGapRule("Classic"), null);
  assert.match(colourPlayGapRule("Bold") ?? "", /COLOUR-PLAY GAP/);
});

test("editorial pairings reach everyone, dosed by boldness and occasion", () => {
  const classic = editorialPairingRule("Classic", "Weekend") ?? "";
  assert.match(classic, /plum \/ aubergine \+ light blue/);
  assert.match(classic, /red \+ black/);
  assert.doesNotMatch(classic, /fuchsia/, "a classic wardrobe gets the quiet pairings only");
  const balanced = editorialPairingRule(null, "Weekend") ?? "";
  assert.match(balanced, /ONE accent piece/);
  assert.match(balanced, /red \+ mint green/);
  assert.match(editorialPairingRule("Bold", "Brunch") ?? "", /whole look/);
  assert.match(editorialPairingRule("Bold", "Work · Fiera") ?? "", /one or two pieces/);
  assert.equal(editorialPairingRule("Bold", "Funerale"), null);
  assert.match(colourPlayGapRule("Creative") ?? "", /editorial pairing/);
});
