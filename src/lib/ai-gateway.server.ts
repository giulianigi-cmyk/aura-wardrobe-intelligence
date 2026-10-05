import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
    fetch: withCostCeilings(globalThis.fetch.bind(globalThis)),
  });
}
