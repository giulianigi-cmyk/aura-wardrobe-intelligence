// Plans and fair-use limits — server side. Reads the person's plan (user_plans), the limits of that
// plan (plan_limits) and counts what they used from the consumption ledger (ai_usage_ledger) and
// wardrobe_items. Observe-only for now: when a limit is passed the first time in a period, one row
// goes to usage_limit_observations; nothing is ever blocked here, and a failure here never reaches
// the feature that was used.
import {
  DEFAULT_TIME_ZONE, EUR_PER_USD, INTERNAL_LIMITS, LIMIT_FOR_FEATURE, LIMIT_KEYS, effectivePlan, isOver,
  isValidTimeZone, periodStart, type LimitKey, type Plan, type PlanLimit, type PlanRow,
} from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadPlanRow(db: Admin, userId: string): Promise<PlanRow> {
  const { data, error } = await db.from("user_plans").select("plan, trial_ends_at, time_zone").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.code ?? "user_plans read failed");
  return (data as PlanRow) ?? null;
}

let limitsCache: { at: number; rows: PlanLimit[] } | null = null;
const LIMITS_TTL_MS = 60_000;

/** All plan limits; kept a minute so a change in plan_limits applies within a minute. */
export async function loadLimits(db: Admin): Promise<PlanLimit[]> {
  if (limitsCache && Date.now() - limitsCache.at < LIMITS_TTL_MS) return limitsCache.rows;
  const { data, error } = await db.from("plan_limits").select("plan, limit_key, period, max_value, enforced");
  if (error) throw new Error(error.code ?? "plan_limits read failed");
  const rows = ((data ?? []) as PlanLimit[]).map((r) => ({ ...r, max_value: r.max_value == null ? null : Number(r.max_value) }));
  limitsCache = { at: Date.now(), rows };
  return rows;
}

type LedgerRow = { user_request_id: string | null; operation: string | null; provider: string; units: number | null; cost_usd_estimate: number | null; cached: boolean };

async function ledgerRows(db: Admin, userId: string, since: Date, features: string[] | null): Promise<LedgerRow[]> {
  let q = db.from("ai_usage_ledger")
    .select("user_request_id, operation, provider, units, cost_usd_estimate, cached")
    .eq("user_id", userId)
    .eq("success", true)
    .gte("created_at", since.toISOString())
    .limit(10_000);
  if (features) q = q.in("feature", features);
  const { data, error } = await q;
  if (error) throw new Error(error.code ?? "ledger read failed");
  return (data ?? []) as LedgerRow[];
}

const distinctRequests = (rows: LedgerRow[]) => new Set(rows.map((r) => r.user_request_id).filter(Boolean)).size;

/** How much of one limit the person used since `since`. One user request = one use (a Stylist
 *  answer with its internal retries counts once). */
export async function countUsed(db: Admin, userId: string, key: LimitKey, since: Date): Promise<number> {
  switch (key) {
    case "new_items": {
      const { count, error } = await db.from("wardrobe_items").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", since.toISOString());
      if (error) throw new Error(error.code ?? "wardrobe_items count failed");
      return count ?? 0;
    }
    case "stylist": return distinctRequests(await ledgerRows(db, userId, since, ["stylist"]));
    case "weekly_plan": return distinctRequests(await ledgerRows(db, userId, since, ["weekly_outfits"]));
    case "trip": return distinctRequests(await ledgerRows(db, userId, since, ["trip"]));
    case "gap_analysis": return distinctRequests(await ledgerRows(db, userId, since, ["gap_analysis"]));
    case "advisor": return distinctRequests(await ledgerRows(db, userId, since, ["advisor"]));
    case "voice_replies": return distinctRequests(await ledgerRows(db, userId, since, ["voice_tts"]));
    case "outfit_scan": return distinctRequests((await ledgerRows(db, userId, since, ["outfit_scan"])).filter((r) => r.operation === "detect"));
    // The first look of the day is the one everyone gets; what counts is every new one after it.
    case "daily_look_regen": return Math.max(0, distinctRequests((await ledgerRows(db, userId, since, ["daily_look"])).filter((r) => !r.cached)) - 1);
    // One look generated (not shown again from the cache), whatever the number of pieces in it.
    case "tryon": return distinctRequests((await ledgerRows(db, userId, since, ["tryon"])).filter((r) => r.operation === "prepare" && !r.cached));
    // Every garment image produced (gateway image model, or FASHN edit as fallback).
    case "reconstruction": return (await ledgerRows(db, userId, since, ["reconstruction"])).filter((r) => Number(r.units ?? 0) > 0).length;
    case "voice_minutes": {
      const rows = (await ledgerRows(db, userId, since, ["voice_transcribe"])).filter((r) => r.provider === "openai");
      return Math.round((rows.reduce((s, r) => s + Number(r.units ?? 0), 0) / 60) * 10) / 10;
    }
    case "cost_cap_eur": {
      const rows = await ledgerRows(db, userId, since, null);
      return Math.round(rows.reduce((s, r) => s + Number(r.cost_usd_estimate ?? 0), 0) * EUR_PER_USD * 100) / 100;
    }
    case "trip_days": return 0; // per request, checked where the trip is planned
  }
}

const OBSERVE_TIMEOUT_MS = 1_500;

/** After a feature ran: for its limit (and the cost ceiling), records the first time this period
 *  that the person went over. Never throws, never waits more than OBSERVE_TIMEOUT_MS. */
export async function observeLimitsAfter(feature: string, userId: string | null): Promise<void> {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const run = (async () => {
    const db = await admin();
    const row = await loadPlanRow(db, userId);
    const { plan } = effectivePlan(row);
    if (plan === "owner") return;
    const keys = new Set<LimitKey>(["cost_cap_eur"]);
    const own = LIMIT_FOR_FEATURE[feature];
    if (own) keys.add(own);
    const limits = (await loadLimits(db)).filter((l) => l.plan === plan && keys.has(l.limit_key) && l.max_value != null);
    const tz = isValidTimeZone(row?.time_zone) ? row!.time_zone! : DEFAULT_TIME_ZONE;
    for (const l of limits) {
      const start = periodStart(l.period, new Date(), tz);
      if (!start) continue;
      const used = await countUsed(db, userId, l.limit_key, start.at);
      if (!isOver(used, l.max_value)) continue;
      const { error } = await db.from("usage_limit_observations").upsert(
        { user_id: userId, limit_key: l.limit_key, period_start: start.date, plan, used, max_value: l.max_value },
        { onConflict: "user_id,limit_key,period_start", ignoreDuplicates: true },
      );
      if (error) console.warn("[AURA plans] observation not recorded", error.code ?? "error");
    }
  })();
  try {
    await Promise.race([run, new Promise((r) => setTimeout(r, OBSERVE_TIMEOUT_MS))]);
  } catch (e) {
    console.warn("[AURA plans] limit check unavailable", e instanceof Error ? e.message : "error");
  }
}

export type UsageLine = { key: LimitKey; period: "day" | "month" | "request"; used: number | null; max: number | null };
export type UsageSummary = { plan: Plan; inTrial: boolean; trialEndsAt: string | null; enforced: boolean; lines: UsageLine[] };

/** The person's plan and, for every limit of it, how much is used in the current period. The time
 *  zone the app reports is stored for the daily counters (only a valid IANA zone is kept). */
export async function usageSummary(userId: string, timeZone: string | null): Promise<UsageSummary> {
  const db = await admin();
  let row = await loadPlanRow(db, userId);
  if (isValidTimeZone(timeZone) && row?.time_zone !== timeZone) {
    const { error } = await db.from("user_plans").upsert({ user_id: userId, time_zone: timeZone, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (!error) row = { plan: row?.plan ?? "free", trial_ends_at: row?.trial_ends_at ?? null, time_zone: timeZone };
  }
  const { plan, inTrial } = effectivePlan(row);
  const tz = isValidTimeZone(row?.time_zone) ? row!.time_zone! : DEFAULT_TIME_ZONE;
  const limits = plan === "owner" ? [] : (await loadLimits(db)).filter((l) => l.plan === plan);
  const now = new Date();
  const lines: UsageLine[] = [];
  for (const key of LIMIT_KEYS) {
    if (INTERNAL_LIMITS.has(key)) continue;
    const l = limits.find((x) => x.limit_key === key);
    const period = l?.period ?? (key === "new_items" || key === "daily_look_regen" ? "day" : key === "trip_days" ? "request" : "month");
    const start = periodStart(period, now, tz);
    const used = start ? await countUsed(db, userId, key, start.at) : null;
    lines.push({ key, period, used, max: plan === "owner" ? null : l?.max_value ?? null });
  }
  return { plan, inTrial, trialEndsAt: row?.trial_ends_at ?? null, enforced: limits.some((l) => l.enforced), lines };
}
