import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** "Il tuo utilizzo": the signed-in person's plan and how much of each limit they used this period.
 *  The app's time zone is sent along so the daily counters reset at local midnight. */
export const getMyUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ timeZone: z.string().max(64).nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { usageSummary } = await import("./plans.server");
    return usageSummary(context.userId, data.timeZone ?? null);
  });
