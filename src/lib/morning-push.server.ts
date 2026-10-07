// Scheduled notifications, run every 15 minutes (pg_cron → /api/public/hooks/send-morning-looks):
// the morning look and the evening reminder of tomorrow's appointments. For every person who turned
// one on and has a subscribed device: when their chosen time comes in their own time zone
// (user_plans.time_zone, synced from the phone), once a day per kind (push_send_log). No AI call:
// the morning one carries the day's temperatures, the evening one tomorrow's appointments; the look
// itself is made when they open the app.
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./plans";
import { isDue, localClock, morningMessage, morningTimeOf, type DayWeather, type MorningPrefs } from "./morning-look";
import { eveningTimeOf, eventReminderMessage, eventsOn, nextDate, type CalendarEvent, type EventReminderPrefs } from "./event-reminder";
import { sendPushToUser } from "./push.server";

type Candidate = { id: string; language: string | null; latitude: number | null; longitude: number | null; notification_preferences: (MorningPrefs & EventReminderPrefs) | null };

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

type Counts = { checked: number; due: number; sent: number; failed: number };

export async function runScheduledPush(now = new Date()): Promise<{ morning: Counts; events: Counts }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const morning: Counts = { checked: 0, due: 0, sent: 0, failed: 0 };
  const events: Counts = { checked: 0, due: 0, sent: 0, failed: 0 };

  // Only people with a notification on AND at least one device subscribed.
  const { data: subs, error: subErr } = await admin.from("push_subscriptions").select("user_id");
  if (subErr) throw new Error(`push_subscriptions read failed: ${subErr.code ?? "error"}`);
  const withDevice = [...new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id))];
  if (!withDevice.length) return { morning, events };

  const { data: profiles, error: profErr } = await admin
    .from("profiles").select("id, language, latitude, longitude, notification_preferences").in("id", withDevice);
  if (profErr) throw new Error(`profiles read failed: ${profErr.code ?? "error"}`);
  const candidates = ((profiles ?? []) as Candidate[])
    .filter((p) => p.notification_preferences?.morning_look === true || p.notification_preferences?.event_reminder === true);
  if (!candidates.length) return { morning, events };

  const { data: plans } = await admin.from("user_plans").select("user_id, time_zone").in("user_id", candidates.map((c) => c.id));
  const tzOf = new Map(((plans ?? []) as { user_id: string; time_zone: string | null }[]).map((p) => [p.user_id, p.time_zone]));

  // Claims today's slot first: a run that overlaps another never sends twice.
  const claim = async (userId: string, kind: string, date: string): Promise<boolean> => {
    const { data, error } = await admin
      .from("push_send_log").upsert({ user_id: userId, kind, local_date: date }, { onConflict: "user_id,kind,local_date", ignoreDuplicates: true })
      .select("user_id");
    return !error && !!data?.length;
  };

  for (const p of candidates) {
    const prefs = p.notification_preferences ?? {};
    const tz = isValidTimeZone(tzOf.get(p.id)) ? tzOf.get(p.id)! : DEFAULT_TIME_ZONE;
    const clock = localClock(now, tz);

    if (prefs.morning_look === true) {
      morning.checked++;
      if (isDue(morningTimeOf(prefs), clock.minutes) && (await claim(p.id, "morning_look", clock.date))) {
        morning.due++;
        const weather = p.latitude != null && p.longitude != null ? await dayWeather(p.latitude, p.longitude, tz) : null;
        const r = await sendPushToUser(p.id, { ...morningMessage(p.language, weather), url: "/", tag: "morning-look" });
        morning.sent += r.sent;
        morning.failed += r.failed;
      }
    }

    if (prefs.event_reminder === true) {
      events.checked++;
      if (!isDue(eveningTimeOf(prefs), clock.minutes)) continue;
      const tomorrow = nextDate(clock.date);
      // Wide window (two days) then filtered by the person's own calendar date.
      const from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      const to = new Date(now.getTime() + 60 * 3600 * 1000).toISOString();
      const { data: rows } = await admin
        .from("calendar_events_cache").select("title, start_time, all_day")
        .eq("user_id", p.id).eq("dismissed_by_user", false).eq("permanently_deleted_by_user", false).eq("removed_from_source", false)
        .gte("start_time", from).lte("start_time", to);
      const message = eventReminderMessage(p.language, eventsOn((rows ?? []) as CalendarEvent[], tomorrow, tz));
      // Nothing tomorrow: no notification, and the slot stays free (an event added later this
      // evening is still announced at the next run in the window).
      if (!message || !(await claim(p.id, "event_reminder", clock.date))) continue;
      events.due++;
      const r = await sendPushToUser(p.id, { ...message, url: `/?day=${tomorrow}`, tag: "event-reminder" });
      events.sent += r.sent;
      events.failed += r.failed;
    }
  }
  return { morning, events };
}
