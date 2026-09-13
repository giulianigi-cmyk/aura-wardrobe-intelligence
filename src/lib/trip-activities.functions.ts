import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DaySegment } from "./trips.functions";

export type TripActivity = {
  id: string;
  trip_id: string;
  activity_date: string; // YYYY-MM-DD
  activity_type: string;
  day_segment: DaySegment | null;
  destination_id: string | null;
  dress_code: string | null;
  notes: string | null;
  created_at: string;
  // Added for the Context & Transition Engine (trip-transition.ts) —
  // nullable since every activity logged before this existed has
  // neither, and a missing time simply keeps that activity from being
  // grouped with a neighbor rather than causing any error.
  start_time: string | null; // "HH:MM"
  end_time: string | null;
  location: string | null;
};

const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM").nullable().optional();

const AddTripActivitySchema = z.object({
  tripId: z.string().uuid(),
  activityDate: z.string(), // YYYY-MM-DD
  activityType: z.string().trim().min(1).max(100),
  daySegment: z.enum(["day", "evening"]).nullable().optional(),
  destinationId: z.string().uuid().nullable().optional(),
  dressCode: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  startTime: timeField,
  endTime: timeField,
  location: z.string().trim().max(200).nullable().optional(),
});

/** Ownership is checked via the parent trip, same pattern as
 *  addTripEssential — trip_day_activities has no user_id of its own. */
export const addTripActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddTripActivitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await (supabase.from("trips" as never) as any)
      .select("id").eq("id", data.tripId).eq("user_id", userId).maybeSingle();
    if (!trip) throw new Error("Trip not found");

    const { data: row, error } = await (supabase.from("trip_day_activities" as never) as any)
      .insert({
        trip_id: data.tripId,
        activity_date: data.activityDate,
        activity_type: data.activityType,
        day_segment: data.daySegment ?? null,
        destination_id: data.destinationId ?? null,
        dress_code: data.dressCode || null,
        notes: data.notes || null,
        start_time: data.startTime || null,
        end_time: data.endTime || null,
        location: data.location || null,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return { activity: row as TripActivity };
  });

const UpdateTripActivitySchema = z.object({
  id: z.string().uuid(),
  activityDate: z.string().optional(),
  activityType: z.string().trim().min(1).max(100).optional(),
  daySegment: z.enum(["day", "evening"]).nullable().optional(),
  destinationId: z.string().uuid().nullable().optional(),
  dressCode: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  startTime: timeField,
  endTime: timeField,
  location: z.string().trim().max(200).nullable().optional(),
});

export const updateTripActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateTripActivitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.activityDate !== undefined) patch.activity_date = data.activityDate;
    if (data.activityType !== undefined) patch.activity_type = data.activityType;
    if (data.daySegment !== undefined) patch.day_segment = data.daySegment;
    if (data.destinationId !== undefined) patch.destination_id = data.destinationId;
    if (data.dressCode !== undefined) patch.dress_code = data.dressCode || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.startTime !== undefined) patch.start_time = data.startTime || null;
    if (data.endTime !== undefined) patch.end_time = data.endTime || null;
    if (data.location !== undefined) patch.location = data.location || null;
    const { error } = await (supabase.from("trip_day_activities" as never) as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const RemoveTripActivitySchema = z.object({ id: z.string().uuid() });

export const removeTripActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveTripActivitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await (supabase.from("trip_day_activities" as never) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
