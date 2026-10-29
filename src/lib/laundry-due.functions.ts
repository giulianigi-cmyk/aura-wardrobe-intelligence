// «Forse da lavare» for the person signed in (laundry-due-data.ts), read with their own client.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { laundryDue, type LaundryDuePiece } from "./laundry-due-data";
import { localClock } from "./morning-look";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./plans";

export const getLaundryDue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LaundryDuePiece[]> => {
    const db = context.supabase as any;
    const [{ data: profile }, { data: plan }] = await Promise.all([
      db.from("profiles").select("latitude, longitude").eq("id", context.userId).maybeSingle(),
      db.from("user_plans").select("time_zone").eq("user_id", context.userId).maybeSingle(),
    ]);
    const tz = isValidTimeZone(plan?.time_zone) ? plan.time_zone : DEFAULT_TIME_ZONE;
    return laundryDue(db, context.userId, {
      today: localClock(new Date(), tz).date,
      latitude: profile?.latitude ?? null, longitude: profile?.longitude ?? null, timeZone: tz,
    });
  });
