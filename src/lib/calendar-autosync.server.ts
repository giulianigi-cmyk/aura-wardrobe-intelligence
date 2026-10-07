// Automatic calendar sync, twice a day (pg_cron → /api/public/hooks/sync-calendars): every
// connected Google, Outlook and iCloud calendar is read again, so Calendar, the looks and the
// evening reminder know about appointments added since the person last opened the app. The same
// sync as the "Sync now" button (which stays); no AI call. Least recently synced first.
const SYNC: Record<string, () => Promise<(userId: string) => Promise<{ ok: boolean }>>> = {
  google: async () => (await import("./google-calendar.server")).syncUserCalendar,
  outlook: async () => (await import("./outlook-calendar.server")).syncOutlookCalendar,
  apple: async () => (await import("./caldav.server")).syncAppleCalendar,
};

export async function runCalendarAutoSync(limit = 200): Promise<{ connections: number; synced: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("calendar_connections" as never) as any)
    .select("user_id, provider, last_synced_at")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`calendar_connections read failed: ${error.code ?? "error"}`);
  let ok = 0, failed = 0;
  for (const c of (data ?? []) as { user_id: string; provider: string }[]) {
    const load = SYNC[c.provider];
    if (!load) continue;
    try {
      // A failure is recorded on the connection itself (last_sync_error), as for a manual sync.
      const r = await (await load())(c.user_id);
      if (r.ok) ok++; else failed++;
    } catch {
      failed++;
    }
  }
  return { connections: (data ?? []).length, synced: ok, failed };
}
