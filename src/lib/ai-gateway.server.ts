import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { gatewayCost, recordUsage, type GatewayUsage } from "./ai-usage.server";

/** Cost ceilings for every text call through the gateway (Gemini 2.5 Flash). No call set them, so
 *  each one ran with the model's default dynamic reasoning and a 65k-token output allowance — both
 *  billed as output. "low" keeps a short reasoning step; the output ceiling only stops a runaway
 *  answer (the longest real answers, the daily looks, are well under it). A call that sets its own
 *  value keeps it. */
export const REASONING_EFFORT = "low";
export const MAX_OUTPUT_TOKENS = 8192;

let ceilingsRejected = false;

/** Adds the ceilings to chat requests. If the gateway refuses the request with them (an unknown
 *  parameter), the same request is sent again exactly as before, and the ceilings are left out from
 *  then on — a cost setting must never take an AI feature down. Image requests are untouched. */
export function withCostCeilings(baseFetch: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (ceilingsRejected || !url.endsWith("/chat/completions") || typeof init?.body !== "string") {
      return baseFetch(input, init);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body);
    } catch {
      return baseFetch(input, init);
    }
    const capped = {
      ...body,
      reasoning_effort: body.reasoning_effort ?? REASONING_EFFORT,
      max_tokens: body.max_tokens ?? MAX_OUTPUT_TOKENS,
    };
    const res = await baseFetch(input, { ...init, body: JSON.stringify(capped) });
    if (res.status !== 400 && res.status !== 422) return res;
    const plain = await baseFetch(input, init);
    if (plain.ok) {
      ceilingsRejected = true;
      console.warn("[AURA ai-gateway] the gateway refused the reasoning/output ceilings; continuing without them", res.status);
    }
    return plain;
  }) as typeof fetch;
}

function modelOf(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === "string") {
    try {
      const m = (JSON.parse(body) as { model?: unknown }).model;
      return typeof m === "string" ? m : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const m = body.get("model");
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

/** Writes one consumption-ledger row per gateway answer (chat and image endpoints): the tokens the
 *  gateway reports and their estimated cost. The response handed back is untouched (read from a
 *  clone); recording can't fail the call. */
export function withUsageRecording(baseFetch: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const operation = url.endsWith("/chat/completions") ? "chat" : /\/images\//.test(url) ? "image" : null;
    if (!operation) return baseFetch(input, init);
    const started = Date.now();
    const res = await baseFetch(input, init);
    const model = modelOf(init?.body);
    let usage: GatewayUsage | undefined;
    if (res.ok) {
      try {
        usage = ((await res.clone().json()) as { usage?: GatewayUsage }).usage;
      } catch {
        // not JSON — counted without tokens
      }
    }
    const t = gatewayCost(model, usage);
    await recordUsage({
      provider: "lovable", model, operation,
      inputTokens: t.input, outputTokens: t.output, reasoningTokens: t.reasoning, cachedInputTokens: t.cached,
      units: operation === "image" && res.ok ? 1 : null, unitType: operation === "image" ? "image" : null,
      costUsd: res.ok ? t.cost : 0, success: res.ok, durationMs: Date.now() - started,
    });
    return res;
  }) as typeof fetch;
}

/** For tests only. */
export function resetCostCeilingsForTest() {
  ceilingsRejected = false;
}

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: withUsageRecording(withCostCeilings(globalThis.fetch.bind(globalThis))),
  });
}
