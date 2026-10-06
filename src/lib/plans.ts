// Plans (FREE / PLUS / ULTRA / OWNER) and their fair-use limits — the pure part, shared by the server
// (plans.server.ts) and the "Il tuo utilizzo" screen. Limits live in the plan_limits table and are
// observe-only while plan_limits.enforced is false: nothing here blocks anything.

export type Plan = "free" | "plus" | "ultra" | "owner";
export type LimitPeriod = "day" | "month" | "request";

export type LimitKey =
  | "new_items" | "stylist" | "weekly_plan" | "trip" | "trip_days" | "outfit_scan" | "gap_analysis"
  | "advisor" | "daily_look_regen" | "tryon" | "reconstruction" | "voice_minutes" | "voice_replies"
  | "cost_cap_eur";

export const LIMIT_KEYS: LimitKey[] = [
  "new_items", "stylist", "daily_look_regen", "weekly_plan", "trip", "trip_days", "outfit_scan",
  "gap_analysis", "advisor", "tryon", "reconstruction", "voice_minutes", "voice_replies", "cost_cap_eur",
];

/** Internal: a cost ceiling, never shown to the person. */
export const INTERNAL_LIMITS = new Set<LimitKey>(["cost_cap_eur"]);

export type PlanLimit = { plan: Exclude<Plan, "owner">; limit_key: LimitKey; period: LimitPeriod; max_value: number | null; enforced: boolean };

export type PlanRow = { plan: Plan; trial_ends_at: string | null; time_zone: string | null } | null;

export const DEFAULT_TIME_ZONE = "Europe/Rome";

/** The plan whose limits apply now: no row = FREE; a FREE person inside the ULTRA trial gets ULTRA. */
export function effectivePlan(row: PlanRow, now: Date = new Date()): { plan: Plan; inTrial: boolean } {
  const plan = row?.plan ?? "free";
  const inTrial = plan === "free" && !!row?.trial_ends_at && new Date(row.trial_ends_at).getTime() > now.getTime();
  return { plan: inTrial ? "ultra" : plan, inTrial };
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date (y, m 1-12, d) of an instant in a time zone. */
function zonedParts(at: Date, tz: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: n("year"), m: n("month"), d: n("day"), hh: n("hour") % 24, mm: n("minute"), ss: n("second") };
}

/** The instant local midnight of (y, m, d) falls on in a time zone. */
function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d);
  let t = wall;
  // Two passes settle the zone's offset, also across a daylight-saving change.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(t), tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    t += wall - shown;
  }
  return new Date(t);
}

/** Start of the current day or month in the person's time zone: the instant (for counting) and the
 *  local date (the period's label in usage_limit_observations). "request" limits have no period. */
export function periodStart(period: LimitPeriod, now: Date, tz: string): { at: Date; date: string } | null {
  if (period === "request") return null;
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  const p = zonedParts(now, zone);
  const d = period === "day" ? p.d : 1;
  const date = `${p.y}-${String(p.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { at: zonedMidnight(p.y, p.m, d, zone), date };
}

/** Over the limit: used more than allowed. No limit (NULL) is never over; 0 = not in the plan, so any
 *  use is over. */
export function isOver(used: number, max: number | null): boolean {
  return max != null && used > max;
}

/** Ledger feature → the limit it counts towards (cost_cap_eur is checked for every feature). */
export const LIMIT_FOR_FEATURE: Partial<Record<string, LimitKey>> = {
  stylist: "stylist",
  weekly_outfits: "weekly_plan",
  trip: "trip",
  outfit_scan: "outfit_scan",
  gap_analysis: "gap_analysis",
  advisor: "advisor",
  daily_look: "daily_look_regen",
  tryon: "tryon",
  reconstruction: "reconstruction",
  voice_transcribe: "voice_minutes",
  voice_tts: "voice_replies",
  item_analysis: "new_items",
  batch_scan: "new_items",
};

/** Estimated EUR per USD for the internal cost ceiling (the ledger records USD estimates). */
export const EUR_PER_USD = 0.92;
