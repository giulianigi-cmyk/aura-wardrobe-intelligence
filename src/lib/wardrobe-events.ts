import { supabase } from "@/integrations/supabase/client";
import { submitOutfitFeedback } from "./outfit-feedback.functions";
import { normalizeOccasionForFeedback } from "./activity-kind";

/**
 * Open vocabulary, matching the DB column (plain text, no CHECK constraint —
 * see the wardrobe_events migration). New types can be added here without
 * a migration. Only "worn" currently drives wardrobe_items.worn_count/
 * last_worn (via the sync_wardrobe_wear_stats trigger) — everything else
 * is history for future statistics/AI to read directly from this table.
 */
export type WardrobeEventType =
  | "planned" | "worn" | "edited" | "cancelled"
  | "imported" | "purchased" | "sold" | "donated"
  | "archived" | "cleaned" | "repaired" | "dry_cleaned";

export type LogWardrobeEventInput = {
  userId: string;
  eventType: WardrobeEventType;
  date: string; // YYYY-MM-DD
  itemIds: string[];
  outfitPlanId?: string | null;
  outfitId?: string | null;
  occasion?: string | null;
  mood?: string | null;
  notes?: string | null;
  weatherCondition?: string | null;
  temperature?: number | null;
};

/** A "repeat" is never a distinct event_type (see wardrobe_events.is_repeat
 *  comment) — it's a "worn" event whose exact item set was already worn
 *  before. Detected here by comparing item sets across the user's past
 *  "worn" events (most recent match wins), so every worn-logging call site
 *  gets this for free instead of re-implementing it. */
async function findRepeatedFromEventId(userId: string, itemIds: string[]): Promise<string | null> {
  const target = new Set(itemIds);
  const { data: events, error: evErr } = await (supabase.from("wardrobe_events" as never) as any)
    .select("id, event_date")
    .eq("user_id", userId)
    .eq("event_type", "worn")
    .order("event_date", { ascending: false })
    .limit(100);
  if (evErr || !events?.length) return null;

  const { data: links, error: linkErr } = await (supabase.from("wardrobe_event_items" as never) as any)
    .select("event_id, item_id")
    .in("event_id", events.map((e: { id: string }) => e.id));
  if (linkErr || !links?.length) return null;

  const byEvent = new Map<string, Set<string>>();
  for (const l of links as { event_id: string; item_id: string }[]) {
    if (!byEvent.has(l.event_id)) byEvent.set(l.event_id, new Set());
    byEvent.get(l.event_id)!.add(l.item_id);
  }
  // events is already newest-first — the first exact match is the most
  // recent time this same outfit was worn.
  for (const ev of events as { id: string; event_date: string }[]) {
    const set = byEvent.get(ev.id);
    if (set && set.size === target.size && [...set].every((id) => target.has(id))) {
      return ev.id;
    }
  }
  return null;
}

/**
 * The ONLY place in the app that writes to wardrobe_events /
 * wardrobe_event_items. wardrobe_items.worn_count and last_worn are never
 * touched here directly — the sync_wardrobe_wear_stats trigger updates
 * those automatically when a "worn" event's items are inserted. Every
 * screen that needs to record something happening to a wardrobe item
 * (planned, worn, edited, cancelled, and future types like purchased/sold)
 * should call this instead of writing wardrobe_items fields by hand.
 */
export async function logWardrobeEvent(input: LogWardrobeEventInput): Promise<{ error: string | null; eventId?: string }> {
  if (!input.itemIds.length) return { error: null };

  let isRepeat = false;
  let repeatedFromEventId: string | null = null;
  if (input.eventType === "worn") {
    repeatedFromEventId = await findRepeatedFromEventId(input.userId, input.itemIds);
    isRepeat = repeatedFromEventId !== null;
  }

  const { data: ev, error } = await (supabase.from("wardrobe_events" as never) as any)
    .insert({
      user_id: input.userId,
      event_type: input.eventType,
      event_date: input.date,
      outfit_plan_id: input.outfitPlanId ?? null,
      outfit_id: input.outfitId ?? null,
      is_repeat: isRepeat,
      repeated_from_event_id: repeatedFromEventId,
      occasion: input.occasion ?? null,
      mood: input.mood ?? null,
      notes: input.notes ?? null,
      temperature: input.temperature ?? null,
      weather_snapshot: input.weatherCondition
        ? { condition: input.weatherCondition, temperature: input.temperature ?? null }
        : null,
    })
    .select("id")
    .single();

  if (error || !ev) return { error: error?.message ?? "Failed to log wardrobe event" };
  const eventId = (ev as { id: string }).id;

  const rows = input.itemIds.map((item_id) => ({ event_id: eventId, item_id }));
  const { error: itemsErr } = await (supabase.from("wardrobe_event_items" as never) as any).insert(rows);
  if (itemsErr) return { error: itemsErr.message, eventId };

  return { error: null, eventId };
}

/** Confirms a planned outfit was actually worn — flips outfit_plans.status
 *  and logs the "worn" event, in one place. Used by both the Calendar's
 *  "Mark as worn" button and the Stylist tab's "Did you wear this?"
 *  prompt, so the write path never drifts between the two. */
export async function confirmOutfitPlanWorn(
  plan: { id: string; date: string; item_ids: string[]; occasion: string | null; notes: string | null },
  userId: string,
  actualItemIds?: string[],
): Promise<{ error: string | null }> {
  const finalItemIds = actualItemIds && actualItemIds.length ? actualItemIds : plan.item_ids;
  const patch: Record<string, unknown> = { status: "worn" };
  if (actualItemIds && actualItemIds.length && JSON.stringify(actualItemIds) !== JSON.stringify(plan.item_ids)) {
    patch.item_ids = actualItemIds;
  }
  const { error } = await (supabase.from("outfit_plans" as never) as any)
    .update(patch)
    .eq("id", plan.id);
  if (error) return { error: error.message };

  const { error: eventErr } = await logWardrobeEvent({
    userId,
    eventType: "worn",
    date: plan.date,
    itemIds: finalItemIds,
    outfitPlanId: plan.id,
    occasion: plan.occasion,
    notes: plan.notes,
  });
  if (eventErr) console.error("[AURA wardrobe-events] log failed", eventErr);

  // A plan the person actually wore is real, direct evidence they liked
  // this combination — the strongest signal short of them saying so —
  // and, because it's tagged with the plan's own occasion, this is also
  // the first real source of occasion-SCOPED learning (until now nothing
  // ever sent an occasion, so every learned preference was general-only).
  // One shared write path (see this function's own doc comment above)
  // means both the Calendar and the Stylist tab's "worn" confirmation
  // feed the same signal, never drifting apart.
  void submitOutfitFeedback({
    data: {
      itemIds: finalItemIds,
      feedbackType: "worn",
      outfitId: null,
      context: (() => { const o = normalizeOccasionForFeedback(plan.occasion); return o ? { occasion: o } : null; })(),
    },
  }).catch((e) => console.error("[AURA wardrobe-events] style-memory feedback failed", e));

  return { error: null };

}

/** Used by the "hasn't been worn in a while" flow in Insights.tsx —
 *  "sell it" and "gift it" both end the item's active life in the same
 *  way (it stops being a candidate for suggestions), so both go through
 *  this one function, differing only in eventType. Archiving is what
 *  actually removes it from every "archived = false" query in the app,
 *  including the detection query that surfaced it here in the first
 *  place — there's no separate "already suggested" flag to maintain,
 *  the item just naturally stops qualifying once archived. */
export async function markItemLifecycleStatus(
  userId: string,
  itemId: string,
  status: Extract<WardrobeEventType, "sold" | "donated">,
): Promise<{ error: string | null }> {
  const { error: archiveErr } = await (supabase.from("wardrobe_items" as never) as any)
    .update({ archived: true })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (archiveErr) return { error: archiveErr.message };

  const { error: eventErr } = await logWardrobeEvent({
    userId,
    eventType: status,
    date: new Date().toISOString().slice(0, 10),
    itemIds: [itemId],
  });
  if (eventErr) console.error("[AURA wardrobe-events] log failed", eventErr);

  return { error: null };
}
