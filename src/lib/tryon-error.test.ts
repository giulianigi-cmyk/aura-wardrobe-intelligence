// Run with: bun test src/lib/tryon-error.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { classifyTryOnError } from "./tryon-error";

test("known provider failures are told apart", () => {
  assert.equal(classifyTryOnError('FASHN /run failed (HTTP 402): {"error":"Insufficient credits"}'), "credits");
  assert.equal(classifyTryOnError("FASHN /run failed (HTTP 429): Too Many Requests"), "rate_limit");
  assert.equal(classifyTryOnError("Impossibile generare questo look", "step"), "provider");
  assert.equal(classifyTryOnError("Load failed"), "network");
  assert.equal(classifyTryOnError("Result generated but could not be saved: x", "save"), "save");
});
