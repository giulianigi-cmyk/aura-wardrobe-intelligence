// Scheduled notifications (morning look, evening reminder of tomorrow's appointments), every 15 minutes. Called by pg_cron (send_morning_looks_if_needed)
// with the shared worker secret — same pattern as recheck-plan-weather.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/send-morning-looks")({
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
          const { runScheduledPush } = await import("@/lib/morning-push.server");
          return Response.json({ ok: true, ...(await runScheduledPush()) });
        } catch (err) {
          console.error("[AURA morning-push] worker failed", err instanceof Error ? err.message : "error");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
