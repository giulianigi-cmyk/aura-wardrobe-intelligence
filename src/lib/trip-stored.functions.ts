import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getTripWeatherMap, weatherKey } from "./trip-weather.server";
import { isInStorage, seasonsForTemperatures, storedPiecesForSeasons } from "./wardrobe-storage";

const MAX_DAYS = 21;

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last && out.length < MAX_DAYS) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Pieces in the cambio stagione that this trip's climate calls for (summer pieces for the
 *  Maldives in October, winter ones for the mountains in July), and those the person has already
 *  agreed to take: added to this trip's capsule by hand. The trip asks before using them. */
export const storedPiecesForTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tripId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: trip } = await db.from("trips").select("id").eq("id", data.tripId).eq("user_id", context.userId).maybeSingle();
    if (!trip) throw new Error("Trip not found");
    const [{ data: dests }, { data: items }, { data: capsule }] = await Promise.all([
      db.from("trip_destinations").select("start_date, end_date, latitude, longitude").eq("trip_id", data.tripId),
      db.from("wardrobe_items").select("id, season, stored_at, archived, active_loan_id").eq("user_id", context.userId).not("stored_at", "is", null),
      db.from("trip_capsule_items").select("wardrobe_item_id, source, removed_by_user").eq("trip_id", data.tripId),
    ]);
    const storedItems = ((items ?? []) as { id: string; season: string | null; stored_at: string | null; archived: boolean | null; active_loan_id: string | null }[])
      .filter((it) => isInStorage(it) && !it.archived && !it.active_loan_id);
    const capsuleRows = (capsule ?? []) as { wardrobe_item_id: string; source: string; removed_by_user: boolean }[];
    const storedIds = new Set(storedItems.map((i) => i.id));
    const acceptedIds = capsuleRows.filter((r) => r.source === "user" && !r.removed_by_user && storedIds.has(r.wardrobe_item_id)).map((r) => r.wardrobe_item_id);
    const removedIds = new Set(capsuleRows.filter((r) => r.removed_by_user).map((r) => r.wardrobe_item_id));

    const requests = ((dests ?? []) as { start_date: string; end_date: string; latitude: number | null; longitude: number | null }[])
      .filter((d) => d.latitude != null && d.longitude != null)
      .flatMap((d) => datesBetween(d.start_date, d.end_date).map((date) => ({ lat: d.latitude!, lon: d.longitude!, date })));
    if (!storedItems.length || !requests.length) return { suggestedIds: [] as string[], acceptedIds, avgMax: null as number | null, estimated: false };
    const weather = await getTripWeatherMap(requests);
    const days = requests.map((r) => weather.get(weatherKey(r.lat, r.lon, r.date))).filter((w): w is NonNullable<typeof w> => !!w);
    if (!days.length) return { suggestedIds: [] as string[], acceptedIds, avgMax: null as number | null, estimated: false };
    const suggested = storedPiecesForSeasons(storedItems, seasonsForTemperatures(days.map((d) => d.tempMax)))
      .filter((it) => !removedIds.has(it.id));
    return {
      suggestedIds: suggested.map((i) => i.id),
      acceptedIds,
      avgMax: Math.round(days.reduce((s, d) => s + d.tempMax, 0) / days.length),
      estimated: days.some((d) => d.estimated),
    };
  });

/** "Yes, use them": these stored pieces join this trip's capsule as chosen by the person, so the
 *  trip generator may use them; they stay in the cambio stagione everywhere else. */
export const addStoredPiecesToTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tripId: z.string().uuid(), itemIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: trip } = await db.from("trips").select("id").eq("id", data.tripId).eq("user_id", context.userId).maybeSingle();
    if (!trip) throw new Error("Trip not found");
    const { data: own } = await db.from("wardrobe_items").select("id").eq("user_id", context.userId).in("id", data.itemIds).not("stored_at", "is", null);
    const ids = ((own ?? []) as { id: string }[]).map((r) => r.id);
    if (!ids.length) return { added: 0 };
    const { error } = await db.from("trip_capsule_items").upsert(
      ids.map((id) => ({ trip_id: data.tripId, wardrobe_item_id: id, source: "user", removed_by_user: false })),
      { onConflict: "trip_id,wardrobe_item_id" },
    );
    if (error) throw new Error(error.message);
    return { added: ids.length };
  });
