// Server-only. Stores the remove.bg out-of-credits marker in app_errors (written by the service
// role only, not readable through the API) so every server instance sees the pause, and alerts
// the admins once. Best-effort throughout: any failure here just means remove.bg is tried.
import { REMOVEBG_NO_CREDIT, REMOVEBG_PAUSE_MS, removeBgPausedAt, removeBgShouldAlert } from "./removebg-credit";
import { BRAND_NAME } from "./brand";

// Per-instance copy of the marker, so a paused instance does not query the table on every photo.
let knownNoCreditAt: number | null = null;
let checkedAt = 0;
const RECHECK_MS = 5 * 60 * 1000;

async function admin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function lastNoCreditAt(db: any, since: number): Promise<number | null> {
  const { data } = await db.from("app_errors").select("created_at")
    .eq("fingerprint", REMOVEBG_NO_CREDIT).gte("created_at", new Date(since).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.created_at ? Date.parse(data.created_at) : null;
}

/** True when remove.bg should not be called right now (out of credits recently). */
export async function removeBgPaused(now = Date.now()): Promise<boolean> {
  if (removeBgPausedAt(knownNoCreditAt, now)) return true;
  if (now - checkedAt < RECHECK_MS) return false;
  checkedAt = now;
  try {
    const db = await admin();
    if (!db) return false;
    knownNoCreditAt = await lastNoCreditAt(db, now - REMOVEBG_PAUSE_MS);
    return removeBgPausedAt(knownNoCreditAt, now);
  } catch {
    return false;
  }
}

/** Records an out-of-credits answer (starts the pause) and alerts the admins at most once a week. */
export async function markRemoveBgOutOfCredits(now = Date.now()): Promise<void> {
  knownNoCreditAt = now;
  try {
    const db = await admin();
    if (!db) return;
    const previous = await lastNoCreditAt(db, now - 8 * 24 * 60 * 60 * 1000);
    await db.from("app_errors").insert({ kind: "service", message: "remove.bg: no credits left (402)", fingerprint: REMOVEBG_NO_CREDIT, platform: "server" });
    if (removeBgShouldAlert(previous, now)) {
      const { alertAdmins } = await import("./problem-reports.server");
      await alertAdmins(
        `${BRAND_NAME} · remove.bg ha finito i crediti`,
        "remove.bg ha risposto che il credito è esaurito. I capi nuovi si salvano comunque con il ritaglio gratuito; remove.bg resta in pausa e viene ritentato ogni 6 ore.\nPer riattivarlo ricarica i crediti su remove.bg. Questo avviso arriva al massimo una volta a settimana.",
      );
    }
  } catch (e) {
    console.warn("[AURA bgremove] credit marker failed", e instanceof Error ? e.name : "error");
  }
}
