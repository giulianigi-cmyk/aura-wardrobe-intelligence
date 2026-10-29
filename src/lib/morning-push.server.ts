// Scheduled notifications, run every 15 minutes (pg_cron → /api/public/hooks/send-morning-looks):
// the morning look (with, a few times a year, the season-change notice) and the evening reminder of
// tomorrow's appointments. For every person who turned
// one on and has a subscribed device: when their chosen time comes in their own time zone
// (user_plans.time_zone, synced from the phone), once a day per kind (push_send_log). No AI call:
// the morning one carries the day's temperatures, the evening one tomorrow's appointments; the look
// itself is made when they open the app.
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "./plans";
import { isDue, localClock, morningMessage, morningTimeOf, type DayWeather, type MorningPrefs } from "./morning-look";
import { eveningTimeOf, eventReminderMessage, eventsOn, nextDate, type CalendarEvent, type EventReminderPrefs } from "./event-reminder";
import { sendPushToUser } from "./push.server";
import { fetchMetnoDaily, utcOffsetSeconds } from "./weather-metno";
import { seasonChangeSuggestions } from "./wardrobe-storage";
import { SEASON_CHANGE_GAP_DAYS, seasonChangeMessage, seasonChangeWorthTelling } from "./season-change-message";
import { dryCleanerPushDay, loanPushDay } from "./laundry-basket";
import { laundryReminderMessage } from "./laundry-reminder-message";
import { garmentWithColor } from "./garment-names";
import { NEWS_PUSH_TIME, newsPushAllowed, newsText, nextNews } from "./feature-news";

type Candidate = { id: string; language: string | null; latitude: number | null; longitude: number | null; notification_preferences: (MorningPrefs & EventReminderPrefs & { season_change?: boolean; laundry_reminders?: boolean }) | null };

/** Today from MET Norway, when Open-Meteo refuses the request (see weather-metno.ts). */
async function metnoDayWeather(lat: number, lon: number, timeZone: string): Promise<DayWeather | null> {
  const days = await fetchMetnoDaily(lat, lon, utcOffsetSeconds(timeZone));
  const today = days?.[localClock(new Date(), timeZone).date];
  return today ? { min: Math.round(today.tempMin), max: Math.round(today.tempMax), rainChance: today.precipitation } : null;
}

async function dayWeather(lat: number, lon: number, timeZone: string): Promise<DayWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=${encodeURIComponent(timeZone)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res || !res.ok) return metnoDayWeather(lat, lon, timeZone);
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

/** Daytime highs of the next two weeks (Open-Meteo); empty when the forecast can't be read. */
async function twoWeekHighs(lat: number, lon: number, timeZone: string): Promise<number[]> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&daily=temperature_2m_max&forecast_days=14&timezone=${encodeURIComponent(timeZone)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res || !res.ok) return [];
    const d = (await res.json()) as { daily?: { temperature_2m_max?: (number | null)[] } };
    return (d.daily?.temperature_2m_max ?? []).filter((x): x is number => typeof x === "number");
  } catch {
    return [];
  }
}

/** The season-change notice (season-change-message.ts): sent with the morning look when the next two
 *  weeks make it worth moving at least a few pieces, at most once every SEASON_CHANGE_GAP_DAYS. */
async function maybeSeasonChange(admin: any, p: Candidate, timeZone: string, today: string): Promise<{ sent: number; failed: number } | null> {
  if (p.notification_preferences?.season_change === false || p.latitude == null || p.longitude == null) return null;
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - SEASON_CHANGE_GAP_DAYS);
  const { data: recent } = await admin.from("push_send_log").select("local_date")
    .eq("user_id", p.id).eq("kind", "season_change").gte("local_date", since.toISOString().slice(0, 10)).limit(1);
  if (recent?.length) return null;
  const highs = await twoWeekHighs(p.latitude, p.longitude, timeZone);
  if (!highs.length) return null;
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + highs.length);
  const [{ data: items }, { data: plans }] = await Promise.all([
    admin.from("wardrobe_items").select("id, season, stored_at, archived, active_loan_id, last_worn").eq("user_id", p.id),
    admin.from("outfit_plans").select("item_ids").eq("user_id", p.id).gte("date", today).lte("date", until.toISOString().slice(0, 10)),
  ]);
  const plannedIds = new Set(((plans ?? []) as { item_ids: string[] | null }[]).flatMap((r) => r.item_ids ?? []));
  const plan = seasonChangeSuggestions((items ?? []) as any[], highs, { today, plannedIds });
  if (!seasonChangeWorthTelling(plan.putAway.length, plan.bringBack.length)) return null;
  const { data: claimed, error } = await admin.from("push_send_log")
    .upsert({ user_id: p.id, kind: "season_change", local_date: today }, { onConflict: "user_id,kind,local_date", ignoreDuplicates: true })
    .select("user_id");
  if (error || !claimed?.length) return null;
  const message = seasonChangeMessage(p.language, {
    putAway: plan.putAway.length, bringBack: plan.bringBack.length,
    minHigh: Math.round(Math.min(...highs)), maxHigh: Math.round(Math.max(...highs)),
  });
  return sendPushToUser(p.id, { ...message, url: "/?open=season-change", tag: "season-change" });
}

/** Dry cleaner and loan reminders (laundry-reminder-message.ts), with the morning look, once a day. */
async function maybeLaundryReminders(admin: any, p: Candidate, today: string, now: Date): Promise<{ sent: number; failed: number } | null> {
  if (p.notification_preferences?.laundry_reminders === false) return null;
  const [{ data: dry }, { data: loans }] = await Promise.all([
    admin.from("wardrobe_items").select("id, laundry_since, laundry_kind").eq("user_id", p.id).eq("laundry_kind", "dry_cleaner"),
    admin.from("wardrobe_loans").select("item_id, borrower_name, loaned_at, updated_at, returned_at").eq("user_id", p.id).is("returned_at", null),
  ]);
  const at = now.getTime();
  const dryCount = ((dry ?? []) as { laundry_since: string | null; laundry_kind: string | null }[]).filter((it) => dryCleanerPushDay(it, at)).length;
  const dueLoans = ((loans ?? []) as { item_id: string; borrower_name: string; loaned_at: string; updated_at: string | null; returned_at: string | null }[])
    .filter((l) => loanPushDay(l, at));
  if (!dryCount && !dueLoans.length) return null;
  let loanParts: { piece: string; name: string }[] = dueLoans.map((l) => ({ piece: "", name: l.borrower_name }));
  if (dueLoans.length === 1) {
    const { data: item } = await admin.from("wardrobe_items").select("category, subcategory, colors").eq("id", dueLoans[0].item_id).maybeSingle();
    const it = (item ?? {}) as { category?: string | null; subcategory?: string | null; colors?: string[] | null };
    const piece = garmentWithColor(it.subcategory || it.category || "", it.colors?.[0] ?? null, p.language);
    loanParts = [{ piece: piece ? piece.charAt(0).toUpperCase() + piece.slice(1) : "", name: dueLoans[0].borrower_name }];
  }
  const message = laundryReminderMessage(p.language, { dryCleaner: dryCount, loans: loanParts });
  if (!message) return null;
  const { data: claimed, error } = await admin.from("push_send_log")
    .upsert({ user_id: p.id, kind: "laundry_reminder", local_date: today }, { onConflict: "user_id,kind,local_date", ignoreDuplicates: true })
    .select("user_id");
  if (error || !claimed?.length) return null;
  return sendPushToUser(p.id, { ...message, url: "/?open=wardrobe", tag: "laundry-reminder" });
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
        // A failure here never holds back the rest of the run.
        const sc = await maybeSeasonChange(admin, p, tz, clock.date).catch(() => null);
        if (sc) { morning.sent += sc.sent; morning.failed += sc.failed; }
        const lr = await maybeLaundryReminders(admin, p, clock.date, now).catch(() => null);
        if (lr) { morning.sent += lr.sent; morning.failed += lr.failed; }
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

/** «Novità» by push (feature-news.ts): at 18:30 in the person's time zone, to someone with a device
 *  who hasn't opened the app for a few days, the newest feature they haven't used and weren't told
 *  about by push — at most one a week. Off with notification_preferences.feature_news = false. */
export async function runNewsPush(now = new Date()): Promise<{ checked: number; sent: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const out = { checked: 0, sent: 0, failed: 0 };
  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const withDevice = [...new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id))];
  if (!withDevice.length) return out;
  const { data: profiles } = await admin.from("profiles").select("id, language, created_at, notification_preferences").in("id", withDevice);
  const people = ((profiles ?? []) as { id: string; language: string | null; created_at: string; notification_preferences: { feature_news?: boolean } | null }[])
    .filter((p) => p.notification_preferences?.feature_news !== false);
  if (!people.length) return out;
  const { data: plans } = await admin.from("user_plans").select("user_id, time_zone").in("user_id", people.map((p) => p.id));
  const tzOf = new Map(((plans ?? []) as { user_id: string; time_zone: string | null }[]).map((p) => [p.user_id, p.time_zone]));

  for (const p of people) {
    const tz = isValidTimeZone(tzOf.get(p.id)) ? tzOf.get(p.id)! : DEFAULT_TIME_ZONE;
    const clock = localClock(now, tz);
    if (!isDue(NEWS_PUSH_TIME, clock.minutes)) continue;
    out.checked++;
    const [{ data: sentRows }, { data: lastOpenRows }, wish, compare] = await Promise.all([
      admin.from("push_send_log").select("kind, local_date").eq("user_id", p.id).like("kind", "news_%").order("local_date", { ascending: false }),
      admin.from("app_events").select("created_at").eq("user_id", p.id).eq("name", "app_open").order("created_at", { ascending: false }).limit(1),
      admin.from("wishlist_items").select("id", { count: "exact", head: true }).eq("user_id", p.id),
      admin.from("ai_usage_ledger").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("feature", "advisor_compare"),
    ]);
    const sent = (sentRows ?? []) as { kind: string; local_date: string }[];
    if (!newsPushAllowed({ lastNewsPush: sent[0]?.local_date ?? null, lastOpen: lastOpenRows?.[0]?.created_at ?? null, today: clock.date, now })) continue;
    const used = new Set<string>();
    if ((wish.count ?? 0) > 0) used.add("wishlist");
    if ((compare.count ?? 0) > 0) used.add("compare");
    const news = nextNews({ signedUpAt: p.created_at, told: new Set(sent.map((r) => r.kind.slice("news_".length))), used });
    if (!news) continue;
    const { data: claimed, error } = await admin.from("push_send_log")
      .upsert({ user_id: p.id, kind: `news_${news.id}`, local_date: clock.date }, { onConflict: "user_id,kind,local_date", ignoreDuplicates: true })
      .select("user_id");
    if (error || !claimed?.length) continue;
    const tx = newsText(p.language, news.id);
    const r = await sendPushToUser(p.id, { title: tx.pushTitle, body: tx.pushBody, url: `/?open=${news.open}`, tag: "feature-news" });
    out.sent += r.sent;
    out.failed += r.failed;
  }
  return out;
}
