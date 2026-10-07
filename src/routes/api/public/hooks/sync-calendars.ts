// Automatic calendar sync, twice a day. Called by pg_cron (sync_calendars_if_needed)
// with the shared worker secret — same pattern as recheck-plan-weather.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-calendars")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SCAN_WORKER_SECRET;
        const provided =
          request.headers.get("x-worker-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          const { runCalendarAutoSync } = await import("@/lib/calendar-autosync.server");
          return Response.json({ ok: true, ...(await runCalendarAutoSync()) });
        } catch (err) {
          console.error("[AURA calendar-autosync] worker failed", err instanceof Error ? err.message : "error");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
