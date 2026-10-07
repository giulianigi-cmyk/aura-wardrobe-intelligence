// The morning look notification, run every 15 minutes (pg_cron → /api/public/hooks/send-morning-looks).
// For every person who turned it on and has a subscribed device: when their chosen time comes in
// their own time zone (user_plans.time_zone, synced from the phone), once a day (push_send_log),
// a push with the day's temperatures where their position is known. No AI call: the look itself is
// made when they open the app.
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./plans";
import { isDue, localClock, morningMessage, morningTimeOf, type DayWeather, type MorningPrefs } from "./morning-look";
import { sendPushToUser } from "./push.server";

type Candidate = { id: string; language: string | null; latitude: number | null; longitude: number | null; notification_preferences: MorningPrefs | null };

async function dayWeather(lat: number, lon: number, timeZone: string): Promise<DayWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=${encodeURIComponent(timeZone)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] } };
    const max = d.daily?.temperature_2m_max?.[0];
    const min = d.daily?.temperature_2m_min?.[0];
    if (typeof max !== "number" || typeof min !== "number") return null;
    const rain = d.daily?.precipitation_probability_max?.[0];
    return { min: Math.round(min), max: Math.round(max), rainChance: typeof rain === "number" ? rain : null };
  } catch {
    return null; // the notification goes out without the weather line
  }
}

export async function runMorningPush(now = new Date()): Promise<{ checked: number; due: number; sent: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  // Only people with the notification on AND at least one device subscribed.
  const { data: subs, error: subErr } = await admin.from("push_subscriptions").select("user_id");
  if (subErr) throw new Error(`push_subscriptions read failed: ${subErr.code ?? "error"}`);
  const withDevice = [...new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id))];
  if (!withDevice.length) return { checked: 0, due: 0, sent: 0, failed: 0 };

  const { data: profiles, error: profErr } = await admin
    .from("profiles").select("id, language, latitude, longitude, notification_preferences").in("id", withDevice);
  if (profErr) throw new Error(`profiles read failed: ${profErr.code ?? "error"}`);
  const candidates = ((profiles ?? []) as Candidate[]).filter((p) => p.notification_preferences?.morning_look === true);
  if (!candidates.length) return { checked: 0, due: 0, sent: 0, failed: 0 };

  const { data: plans } = await admin.from("user_plans").select("user_id, time_zone").in("user_id", candidates.map((c) => c.id));
  const tzOf = new Map(((plans ?? []) as { user_id: string; time_zone: string | null }[]).map((p) => [p.user_id, p.time_zone]));

  let due = 0, sent = 0, failed = 0;
  for (const p of candidates) {
    const tz = isValidTimeZone(tzOf.get(p.id)) ? tzOf.get(p.id)! : DEFAULT_TIME_ZONE;
    const clock = localClock(now, tz);
    if (!isDue(morningTimeOf(p.notification_preferences), clock.minutes)) continue;
    // Claims today's slot first: a run that overlaps another never sends twice.
    const { data: claimed, error: claimErr } = await admin
      .from("push_send_log").upsert({ user_id: p.id, kind: "morning_look", local_date: clock.date }, { onConflict: "user_id,kind,local_date", ignoreDuplicates: true })
      .select("user_id");
    if (claimErr || !claimed?.length) continue;
    due++;
    const weather = p.latitude != null && p.longitude != null ? await dayWeather(p.latitude, p.longitude, tz) : null;
    const message = morningMessage(p.language, weather);
    const r = await sendPushToUser(p.id, { ...message, url: "/", tag: "morning-look" });
    sent += r.sent;
    failed += r.failed;
  }
  return { checked: candidates.length, due, sent, failed };
}
