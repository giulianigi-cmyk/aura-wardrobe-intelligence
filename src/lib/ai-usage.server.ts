// AI / paid-API consumption ledger (table ai_usage_ledger). Server-only.
//
// Each server function names the feature it serves (usageFeature middleware in ai-usage.ts); every
// paid provider call made while it runs — Gemini / GPT-Image through the Lovable gateway, FASHN,
// remove.bg, Firecrawl, Whisper, TTS — writes one row with the provider's own consumption figures
// and an estimated cost. Only numbers are stored: never a prompt, image, answer or URL.
//
// Recording never changes what the app does: it runs after the provider has answered, and any
// failure (no database, a slow insert) is swallowed after a short timeout.
import type { AsyncLocalStorage } from "node:async_hooks";

export type UsageFeature =
  | "item_analysis" | "bg_removal" | "batch_scan" | "url_import" | "outfit_scan" | "reconstruction"
  | "photo_enhance" | "wear_log" | "stylist" | "voice_transcribe" | "voice_tts" | "suggest_outfit"
  | "weekly_outfits" | "daily_look" | "trip" | "gap_analysis" | "advisor" | "advisor_compare"
  | "tryon" | "unscoped";

type Scope = { feature: UsageFeature; action: string | null; step?: string | null; userId: string | null; userRequestId: string; calls: Map<string, number> };

// node:async_hooks is loaded at run time on the server only. Some of the files that record usage
// are also part of the browser bundle (their server code is never run there), and a static import
// would pull a Node module into it; the variable specifier keeps every bundler from following it.
const ASYNC_HOOKS = "node:async_hooks";
let storage: AsyncLocalStorage<Scope> | null = null;
async function scopeStorage(): Promise<AsyncLocalStorage<Scope>> {
  if (!storage) {
    const { AsyncLocalStorage: Als } = (await import(/* @vite-ignore */ ASYNC_HOOKS)) as typeof import("node:async_hooks");
    storage ??= new Als<Scope>();
  }
  return storage;
}

/** Names the step of the current request the next paid calls belong to (a Stylist reply, its
 *  re-read, a repair…), so the ledger shows which step costs what. No scope → nothing happens. */
export function setUsageStep(step: string | null): void {
  const scope = storage?.getStore();
  if (scope) scope.step = step;
}

/** Runs fn with every paid call inside it attributed to this feature (and step of it, e.g. an
 *  Outfit Scan's "detect" vs "rerank"), user and user request. */
export async function runInUsageScope<T>(feature: UsageFeature, userId: string | null | undefined, fn: () => Promise<T>, action: string | null = null): Promise<T> {
  const als = await scopeStorage();
  return als.run({ feature, action, userId: userId ?? null, userRequestId: crypto.randomUUID(), calls: new Map() }, fn);
}

// ---- Prices (USD) -----------------------------------------------------------------------------
// From the cost audit of 2026-10-05: public list prices, read through search results (the official
// pages could not be opened), and the Lovable gateway's own rates are not published. Estimates —
// the consumption columns are exact and cost can be recomputed later with real prices.
export const PRICE_VERSION = "2026-10-05-estimate";
const PER_M = 1_000_000;
const GEMINI_25_FLASH = { input: 0.3, cachedInput: 0.03, output: 2.5 };
const GPT_IMAGE = { textInput: 5, imageInput: 8, output: 30 };
const FASHN_CREDIT = 0.075;
/** tryon-max balanced 2k = 3 credits. edit is called without mode/resolution: billed fast at 1k or
 *  balanced at 2k+, resolution unknown — counted at 3 so the estimate never undershoots. */
export const FASHN_CREDITS = { "tryon-max": 3, edit: 3 } as const;
const REMOVEBG_CREDIT = 0.2;
const FIRECRAWL_CREDIT = 0.0032;
const WHISPER_MINUTE = 0.006;
const TTS1_PER_M_CHARS = 15;

export type GatewayUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  input_tokens_details?: { text_tokens?: number; image_tokens?: number; cached_tokens?: number };
};

/** Tokens and cost of one gateway answer. Billed output = total − prompt, so reasoning tokens are
 *  counted once whether the gateway reports them inside completion_tokens or beside it. */
export function gatewayCost(model: string | undefined, usage: GatewayUsage | undefined) {
  if (!usage) return { input: null, output: null, reasoning: null, cached: null, cost: null };
  const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? null;
  if (usage.prompt_tokens != null) {
    const input = usage.prompt_tokens;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const output = usage.total_tokens != null ? Math.max(0, usage.total_tokens - input) : (usage.completion_tokens ?? 0);
    const cost = model?.startsWith("google/gemini-2.5-flash")
      ? ((input - cached) * GEMINI_25_FLASH.input + cached * GEMINI_25_FLASH.cachedInput + output * GEMINI_25_FLASH.output) / PER_M
      : null;
    return { input, output, reasoning, cached, cost };
  }
  if (usage.input_tokens != null || usage.output_tokens != null) {
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const text = usage.input_tokens_details?.text_tokens;
    const image = usage.input_tokens_details?.image_tokens;
    // Without the text/image split every input token is priced as image input (the dearer one).
    const inputCost = text != null || image != null ? (text ?? 0) * GPT_IMAGE.textInput + (image ?? 0) * GPT_IMAGE.imageInput : input * GPT_IMAGE.imageInput;
    const cost = model?.startsWith("openai/gpt-image") ? (inputCost + output * GPT_IMAGE.output) / PER_M : null;
    return { input, output, reasoning, cached: usage.input_tokens_details?.cached_tokens ?? null, cost };
  }
  return { input: null, output: null, reasoning: null, cached: null, cost: null };
}

export const unitCost = {
  fashn: (credits: number) => credits * FASHN_CREDIT,
  removebg: (credits: number) => credits * REMOVEBG_CREDIT,
  firecrawl: (credits: number) => credits * FIRECRAWL_CREDIT,
  whisper: (seconds: number) => (seconds / 60) * WHISPER_MINUTE,
  tts: (characters: number) => (characters * TTS1_PER_M_CHARS) / PER_M,
};

// ---- Recording ----------------------------------------------------------------------------------
export type UsageEntry = {
  provider: "lovable" | "fashn" | "removebg" | "firecrawl" | "openai";
  model?: string | null;
  operation?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  cachedInputTokens?: number | null;
  units?: number | null;
  unitType?: "image" | "credit" | "second" | "character" | "scrape" | null;
  costUsd?: number | null;
  providerRequestId?: string | null;
  success: boolean;
  cached?: boolean;
  durationMs?: number | null;
};

const RECORD_TIMEOUT_MS = 2_000;

/** The row recordUsage writes, with the feature, user and user request of the current scope. */
export function ledgerRow(entry: UsageEntry, scope: Scope | undefined = storage?.getStore()) {
  const key = `${entry.provider}:${entry.model ?? ""}`;
  const attempt = (scope?.calls.get(key) ?? 0) + 1;
  scope?.calls.set(key, attempt);
  return {
    user_id: scope?.userId ?? null,
    feature: scope?.feature ?? "unscoped",
    user_request_id: scope?.userRequestId ?? null,
    provider: entry.provider,
    model: entry.model ?? null,
    operation: scope?.step ?? scope?.action ?? entry.operation ?? null,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    reasoning_tokens: entry.reasoningTokens ?? null,
    cached_input_tokens: entry.cachedInputTokens ?? null,
    units: entry.units ?? null,
    unit_type: entry.unitType ?? null,
    cost_usd_estimate: entry.costUsd == null ? null : Math.round(entry.costUsd * 1e6) / 1e6,
    price_version: PRICE_VERSION,
    provider_request_id: entry.providerRequestId ?? null,
    success: entry.success,
    attempt: Math.min(attempt, 32767),
    cached: entry.cached ?? false,
    duration_ms: entry.durationMs == null ? null : Math.round(entry.durationMs),
  };
}

/** Writes one ledger row. Never throws and never waits more than RECORD_TIMEOUT_MS. */
export async function recordUsage(entry: UsageEntry): Promise<void> {
  try {
    const row = ledgerRow(entry);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const insert = (async () => {
      const { error } = await (supabaseAdmin.from("ai_usage_ledger" as never) as any).insert(row);
      // 23505: this provider job was already counted (a second status read). Anything else is
      // logged without content — the ledger must never break the feature it measures.
      if (error && error.code !== "23505") console.warn("[AURA usage] ledger insert failed", error.code ?? error.message);
    })();
    await Promise.race([insert, new Promise((r) => setTimeout(r, RECORD_TIMEOUT_MS))]);
  } catch (e) {
    console.warn("[AURA usage] ledger unavailable", e instanceof Error ? e.message : String(e));
  }
}
