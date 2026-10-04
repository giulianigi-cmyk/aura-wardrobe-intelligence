import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolvePlanSlot, validateEventSlot } from "./outfit-plan-slot";

const InputSchema = z.object({
  itemIds: z.array(z.string()).min(1),
  date: z.string(), // YYYY-MM-DD
  calendarEventId: z.string().nullable().optional(),
  /** A day that already has an outfit: "ask" reports it back (the person chooses), "add" saves this
   *  one as a further outfit of that day (they changed clothes — outfit_plans.extra_slot), "replace"
   *  overwrites the day's outfit (the old behaviour, still the default for existing callers). */
  sameDay: z.enum(["ask", "add", "replace"]).optional(),
});

/**
 * Punto unico per salvare un outfit nel planner — promemoria/sync futuri vivranno qui.
 *
 * Lo slot (evento / generale / viaggio) e il relativo onConflict arrivano da
 * resolvePlanSlot, così un piano legato a un evento non finisce mai nello slot
 * generale (e viceversa). Vedi outfit-plan-slot.ts anche per il debito tecnico
 * sugli id di calendar_events_cache che cambiano se la connessione calendario
 * viene ricreata.
 */
export const saveOutfitPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const calendarEventId = data.calendarEventId ?? null;

    if (calendarEventId) {
      const problem = await validateEventSlot(context.supabase, context.userId, calendarEventId, data.date);
      if (problem) throw new Error(problem);
    }

    if (!calendarEventId && (data.sameDay === "ask" || data.sameDay === "add")) {
      const { data: dayPlans, error: dayErr } = await context.supabase
        .from("outfit_plans")
        .select("id, item_ids, extra_slot")
        .eq("user_id", context.userId).eq("date", data.date)
        .is("calendar_event_id", null).is("trip_id", null);
      if (dayErr) throw new Error(dayErr.message);
      const plans = (dayPlans ?? []) as { id: string; item_ids: string[]; extra_slot: number }[];
      const sameItems = (a: string[]) => a.length === data.itemIds.length && a.every((id) => data.itemIds.includes(id));
      if (plans.some((p) => sameItems(p.item_ids ?? []))) return { ok: true as const }; // already on that day
      if (plans.length && data.sameDay === "ask") return { ok: false as const, sameDayTaken: true as const };
      const extraSlot = plans.length ? Math.max(...plans.map((p) => p.extra_slot ?? 0)) + 1 : 0;
      const { error } = await context.supabase.from("outfit_plans").insert({
        user_id: context.userId, date: data.date, item_ids: data.itemIds, calendar_event_id: null, extra_slot: extraSlot,
      });
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }

    const payload = {
      user_id: context.userId,
      date: data.date,
      item_ids: data.itemIds,
      calendar_event_id: calendarEventId,
    };
    const { onConflict } = resolvePlanSlot({ calendarEventId });
    const { error } = await context.supabase
      .from("outfit_plans")
      .upsert(payload, { onConflict });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
