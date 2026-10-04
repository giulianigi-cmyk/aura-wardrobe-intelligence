// A day that already has an outfit: ask whether this one is an extra outfit of that day (the person
// changed clothes) or replaces it. A toast with two actions, so every "add to calendar" place can use
// it without its own dialog.
import { toast } from "sonner";
import type { TFunction } from "i18next";

export type SameDayChoice = "add" | "replace";

export function askSameDay(t: TFunction): Promise<SameDayChoice | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: SameDayChoice | null) => { if (!settled) { settled = true; resolve(v); } };
    toast(t("sameDay.title"), {
      description: t("sameDay.body"),
      duration: 20000,
      action: { label: t("sameDay.add"), onClick: () => done("add") },
      cancel: { label: t("sameDay.replace"), onClick: () => done("replace") },
      onDismiss: () => done(null),
      onAutoClose: () => done(null),
    });
  });
}

type SavePlan = (args: { data: { itemIds: string[]; date: string; sameDay?: "ask" | "add" | "replace" } }) => Promise<{ ok: true } | { ok: false; sameDayTaken: true }>;

/** Saves to the calendar; when the day already has a different outfit, asks first. Resolves to false
 *  when the person dismissed the question (nothing saved). */
export async function savePlanAskingSameDay(savePlan: SavePlan, itemIds: string[], date: string, t: TFunction): Promise<boolean> {
  const first = await savePlan({ data: { itemIds, date, sameDay: "ask" } });
  if (first.ok) return true;
  const choice = await askSameDay(t);
  if (!choice) return false;
  const second = await savePlan({ data: { itemIds, date, sameDay: choice } });
  return second.ok;
}

type PlanFields = { item_ids: string[]; status?: string; occasion?: string | null; notes?: string | null };

/** Client-side version for screens that write outfit_plans directly: saves the day's general outfit,
 *  or — when the day already has a different one — asks, then adds a further outfit of that day
 *  (extra_slot) or replaces the main one. Returns the plan id, or null when the person dismissed it. */
export async function saveGeneralPlanAskingSameDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, userId: string, date: string, fields: PlanFields, t: TFunction,
): Promise<string | null> {
  const { data: dayPlans, error: readErr } = await supabase.from("outfit_plans")
    .select("id, item_ids, extra_slot").eq("user_id", userId).eq("date", date)
    .is("calendar_event_id", null).is("trip_id", null);
  if (readErr) throw readErr;
  const existing = (dayPlans ?? []) as { id: string; item_ids: string[] | null; extra_slot: number | null }[];
  const same = existing.find((p) => (p.item_ids ?? []).length === fields.item_ids.length && fields.item_ids.every((id) => (p.item_ids ?? []).includes(id)));
  if (same) return same.id;
  if (!existing.length) {
    const { data, error } = await supabase.from("outfit_plans").insert({ user_id: userId, date, calendar_event_id: null, ...fields }).select("id").single();
    if (error) throw error;
    return (data as { id: string }).id;
  }
  const choice = await askSameDay(t);
  if (!choice) return null;
  if (choice === "replace") {
    const main = existing.find((p) => (p.extra_slot ?? 0) === 0) ?? existing[0];
    const { error } = await supabase.from("outfit_plans").update(fields).eq("id", main.id);
    if (error) throw error;
    return main.id;
  }
  const { data, error } = await supabase.from("outfit_plans").insert({
    user_id: userId, date, calendar_event_id: null, ...fields,
    extra_slot: Math.max(...existing.map((p) => p.extra_slot ?? 0)) + 1,
  }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}
