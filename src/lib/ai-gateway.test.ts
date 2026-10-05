// Run with: bun test src/lib/ai-gateway.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { MAX_OUTPUT_TOKENS, REASONING_EFFORT, resetCostCeilingsForTest, withCostCeilings } from "./ai-gateway.server";

const completion = (text: string) => new Response(JSON.stringify({
  id: "x", object: "chat.completion", created: 0, model: "google/gemini-2.5-flash",
  choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
}), { status: 200, headers: { "Content-Type": "application/json" } });

function recorder(respond: (body: Record<string, unknown>, n: number) => Response) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    return respond(body, bodies.length);
  }) as typeof fetch;
  return { bodies, fetchFn };
}

function model(fetchFn: typeof fetch) {
  return createOpenAICompatible({ name: "lovable", baseURL: "https://gateway.test/v1", fetch: withCostCeilings(fetchFn) })("google/gemini-2.5-flash");
}

test("a real generateText call carries the reasoning and output ceilings", async () => {
  resetCostCeilingsForTest();
  const { bodies, fetchFn } = recorder(() => completion("ok"));
  const r = await generateText({ model: model(fetchFn), prompt: "hi" });
  assert.equal(r.text, "ok");
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].reasoning_effort, REASONING_EFFORT);
  assert.equal(bodies[0].max_tokens, MAX_OUTPUT_TOKENS);
});

test("a call's own output limit is kept", async () => {
  resetCostCeilingsForTest();
  const { bodies, fetchFn } = recorder(() => completion("ok"));
  await generateText({ model: model(fetchFn), prompt: "hi", maxOutputTokens: 300 });
  assert.equal(bodies[0].max_tokens, 300);
});

test("refused ceilings: the request is resent unchanged and they are dropped from then on", async () => {
  resetCostCeilingsForTest();
  const { bodies, fetchFn } = recorder((body) =>
    "reasoning_effort" in body ? new Response(JSON.stringify({ error: { message: "unknown parameter reasoning_effort" } }), { status: 400 }) : completion("ok"));
  const r = await generateText({ model: model(fetchFn), prompt: "hi", maxRetries: 0 });
  assert.equal(r.text, "ok");
  assert.equal(bodies.length, 2);
  assert.ok(!("reasoning_effort" in bodies[1]) && !("max_tokens" in bodies[1]));
  await generateText({ model: model(fetchFn), prompt: "again", maxRetries: 0 });
  assert.equal(bodies.length, 3);
  assert.ok(!("reasoning_effort" in bodies[2]));
});

test("a request that fails for its own reasons still fails, and the ceilings stay on", async () => {
  resetCostCeilingsForTest();
  const { bodies, fetchFn } = recorder((_b, n) => n <= 2 ? new Response(JSON.stringify({ error: { message: "bad image" } }), { status: 400 }) : completion("ok"));
  await assert.rejects(generateText({ model: model(fetchFn), prompt: "hi", maxRetries: 0 }));
  await generateText({ model: model(fetchFn), prompt: "again", maxRetries: 0 });
  assert.equal(bodies[2].reasoning_effort, REASONING_EFFORT);
});

test("non-chat requests (image models) are untouched", async () => {
  resetCostCeilingsForTest();
  let seen = "";
  const wrapped = withCostCeilings((async (_i: RequestInfo | URL, init?: RequestInit) => { seen = String(init?.body); return new Response("{}"); }) as typeof fetch);
  await wrapped("https://gateway.test/v1/images/generations", { method: "POST", body: JSON.stringify({ prompt: "x" }) });
  assert.equal(seen, JSON.stringify({ prompt: "x" }));
});
