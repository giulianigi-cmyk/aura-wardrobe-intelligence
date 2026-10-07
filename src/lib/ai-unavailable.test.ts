// Run with: bun test src/lib/ai-unavailable.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isServiceOutOfCredits, SERVICE_UNAVAILABLE } from "./ai-unavailable";

test("an exhausted AI credit is recognised", () => {
  assert.equal(isServiceOutOfCredits("Payment Required"), true);
  assert.equal(isServiceOutOfCredits(new Error("Payment Required")), true);
  assert.equal(isServiceOutOfCredits(Object.assign(new Error("x"), { statusCode: 402 })), true);
  assert.equal(isServiceOutOfCredits(`${SERVICE_UNAVAILABLE}: Payment Required`), true);
  assert.equal(isServiceOutOfCredits("Insufficient credits"), true);
});

test("other failures are not mistaken for it", () => {
  assert.equal(isServiceOutOfCredits("The operation was aborted due to timeout"), false);
  assert.equal(isServiceOutOfCredits("Too Many Requests"), false);
  assert.equal(isServiceOutOfCredits(Object.assign(new Error("x"), { statusCode: 429 })), false);
  assert.equal(isServiceOutOfCredits("download failed"), false);
  assert.equal(isServiceOutOfCredits(null), false);
});
