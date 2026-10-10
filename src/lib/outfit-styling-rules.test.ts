// Run with: bun test src/lib/outfit-styling-rules.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isEveningOnlyPiece } from "./outfit-styling-rules";

test("evening-only pieces: Day/Evening = evening, or only evening tags", () => {
  assert.equal(isEveningOnlyPiece({ dayEvening: "evening", occasion: "Evening, Business Formal" }), true);
  assert.equal(isEveningOnlyPiece({ dayEvening: null, occasion: "Evening, Cocktail" }), true);
  assert.equal(isEveningOnlyPiece({ dayEvening: "both", occasion: "Evening" }), false);
  assert.equal(isEveningOnlyPiece({ dayEvening: "", occasion: "Everyday, Evening" }), false);
  assert.equal(isEveningOnlyPiece({ dayEvening: null, occasion: null }), false);
});
