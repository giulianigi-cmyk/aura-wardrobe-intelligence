import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncMyTimeZone } from "@/lib/plans.functions";

/** Once per app open and signed-in person: sends the phone's time zone for the daily plan counters. */
export function useTimeZoneSync(userId: string | undefined) {
  const sync = useServerFn(syncMyTimeZone);
  useEffect(() => {
    if (!userId) return;
    let timeZone: string | null = null;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return;
    }
    if (!timeZone) return;
    sync({ data: { timeZone } }).catch(() => {
      // Not important enough to tell anyone: the counters keep the zone already stored.
    });
  }, [userId, sync]);
}
