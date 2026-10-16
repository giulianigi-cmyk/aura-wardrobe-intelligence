// Run with: bun test src/lib/network-retry.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isNetworkError, retryOnNetworkError } from "./network-retry";

test("a dropped request is tried once more and its second answer is returned", async () => {
  let calls = 0;
  const out = await retryOnNetworkError(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("Load failed");
    return "ok";
  }, 1);
  assert.equal(out, "ok");
  assert.equal(calls, 2);
});

test("only one retry: a second network failure reaches the caller", async () => {
  let calls = 0;
  await assert.rejects(retryOnNetworkError(async () => { calls += 1; throw new TypeError("Failed to fetch"); }, 1));
  assert.equal(calls, 2);
});

test("other errors are not retried", async () => {
  let calls = 0;
  await assert.rejects(retryOnNetworkError(async () => { calls += 1; throw new Error("image fetch failed: 403"); }, 1));
  assert.equal(calls, 1);
  assert.equal(isNetworkError(new Error("image fetch failed: 403")), false);
  assert.equal(isNetworkError(new Error("Load failed")), true);
});
