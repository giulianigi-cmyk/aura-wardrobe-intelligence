// Run with: bun test src/lib/ai-usage.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { gatewayCost, ledgerRow, PRICE_VERSION, recordUsage, runInUsageScope, unitCost } from "./ai-usage.server";
import { withCostCeilings, withUsageRecording } from "./ai-gateway.server";

const close = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("Gemini cost: input, cached input and billed output (total − prompt, reasoning counted once)", () => {
  const t = gatewayCost("google/gemini-2.5-flash", {
    prompt_tokens: 10_000, completion_tokens: 700, total_tokens: 11_000,
    prompt_tokens_details: { cached_tokens: 4_000 }, completion_tokens_details: { reasoning_tokens: 300 },
  });
  assert.equal(t.input, 10_000);
  assert.equal(t.output, 1_000);
  assert.equal(t.reasoning, 300);
  assert.equal(t.cached, 4_000);
  close(t.cost, (6_000 * 0.3 + 4_000 * 0.03 + 1_000 * 2.5) / 1e6);
});

test("Gemini cost without total_tokens falls back to completion_tokens", () => {
  const t = gatewayCost("google/gemini-2.5-flash", { prompt_tokens: 1_000, completion_tokens: 200 });
  close(t.cost, (1_000 * 0.3 + 200 * 2.5) / 1e6);
});

test("GPT-Image cost: text and image input priced apart; image price when the split is missing", () => {
  const split = gatewayCost("openai/gpt-image-2", { input_tokens: 1_500, output_tokens: 6_000, input_tokens_details: { text_tokens: 500, image_tokens: 1_000 } });
  close(split.cost, (500 * 5 + 1_000 * 8 + 6_000 * 30) / 1e6);
  const whole = gatewayCost("openai/gpt-image-2", { input_tokens: 1_500, output_tokens: 6_000 });
  close(whole.cost, (1_500 * 8 + 6_000 * 30) / 1e6);
});

test("unknown model or no usage: tokens kept when known, cost left empty (never guessed)", () => {
  assert.equal(gatewayCost("some/other-model", { prompt_tokens: 10, total_tokens: 20 }).cost, null);
  assert.deepEqual(gatewayCost("google/gemini-2.5-flash", undefined), { input: null, output: null, reasoning: null, cached: null, cost: null });
});

test("unit prices", () => {
  close(unitCost.fashn(3), 0.225);
  close(unitCost.whisper(90), 0.009);
  close(unitCost.tts(500), 0.0075);
});

test("rows carry the feature, step, user and one request id across awaits; call numbers per provider+model", async () => {
  const rows = await runInUsageScope("stylist", "user-1", async () => {
    const a = ledgerRow({ provider: "lovable", model: "google/gemini-2.5-flash", success: true });
    await new Promise((r) => setTimeout(r, 5));
    const b = ledgerRow({ provider: "lovable", model: "google/gemini-2.5-flash", success: true });
    const c = ledgerRow({ provider: "openai", model: "tts-1", success: true });
    return [a, b, c];
  }, "reply");
  assert.deepEqual(rows.map((r) => [r.feature, r.operation, r.user_id, r.attempt]), [
    ["stylist", "reply", "user-1", 1], ["stylist", "reply", "user-1", 2], ["stylist", "reply", "user-1", 1],
  ]);
  assert.equal(new Set(rows.map((r) => r.user_request_id)).size, 1);
  assert.equal(rows[0].price_version, PRICE_VERSION);
});

test("two user requests get different request ids; outside a scope the row is 'unscoped'", async () => {
  const a = await runInUsageScope("daily_look", "u", async () => ledgerRow({ provider: "lovable", success: true }));
  const b = await runInUsageScope("daily_look", "u", async () => ledgerRow({ provider: "lovable", success: true }));
  assert.notEqual(a.user_request_id, b.user_request_id);
  const none = ledgerRow({ provider: "lovable", success: true });
  assert.equal(none.feature, "unscoped");
  assert.equal(none.user_id, null);
});

test("costs are rounded to 6 decimals; no content fields exist on a row", () => {
  const r = ledgerRow({ provider: "lovable", success: true, costUsd: 0.00123456789 });
  assert.equal(r.cost_usd_estimate, 0.001235);
  for (const key of Object.keys(r)) assert.ok(!/prompt|text|image_url|url|answer|content/.test(key), key);
});

test("recording never throws (no database configured)", async () => {
  await recordUsage({ provider: "fashn", success: true, units: 3, unitType: "credit" });
});

test("the gateway still hands the SDK an intact answer while usage is read", async () => {
  const fetchFn = (async () => new Response(JSON.stringify({
    id: "x", object: "chat.completion", created: 0, model: "google/gemini-2.5-flash",
    choices: [{ index: 0, message: { role: "assistant", content: "ciao" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const model = createOpenAICompatible({ name: "lovable", baseURL: "https://gateway.test/v1", fetch: withUsageRecording(withCostCeilings(fetchFn)) })("google/gemini-2.5-flash");
  const r = await runInUsageScope("stylist", "u", () => generateText({ model, prompt: "hi" }));
  assert.equal(r.text, "ciao");
  assert.equal(r.usage.inputTokens, 5);
});

test("a named step labels the rows of the calls that follow it, within the same request", async () => {
  const { setUsageStep } = await import("./ai-usage.server");
  const rows = await runInUsageScope("stylist", "u", async () => {
    setUsageStep("reply");
    const a = ledgerRow({ provider: "lovable", success: true });
    setUsageStep("repair_outfit");
    const b = ledgerRow({ provider: "lovable", success: true });
    return [a, b];
  });
  assert.deepEqual(rows.map((r) => r.operation), ["reply", "repair_outfit"]);
  setUsageStep("outside"); // no scope: nothing happens, never throws
});
