// Event reminder: the evening before a day with appointments in the connected calendar, at the
// time the person chooses, a push naming tomorrow's appointments. Tapping it opens Calendar on
// that day, where "Chiedi allo stylist" prepares the look — no AI call is made for the reminder.
import { localClock } from "./morning-look";

/** Choosable times: every 15 minutes from 17:00 to 22:00. */
export const EVENING_TIMES: string[] = Array.from({ length: (22 - 17) * 4 + 1 }, (_, i) => {
  const m = 17 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
export const DEFAULT_EVENING_TIME = "20:00";

export type EventReminderPrefs = { event_reminder?: boolean; event_reminder_time?: string };

export function eveningTimeOf(prefs: EventReminderPrefs | null | undefined): string {
  const t = prefs?.event_reminder_time;
  return t && EVENING_TIMES.includes(t) ? t : DEFAULT_EVENING_TIME;
}

/** The calendar date after `date` (YYYY-MM-DD). */
export function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export type CalendarEvent = { title: string | null; start_time: string; all_day: boolean };
export type DayEvent = { title: string | null; time: string | null };

/** The appointments on `date` in the person's time zone, in order. All-day events are stored at
 *  midnight UTC of their date and keep that date whatever the time zone. */
export function eventsOn(events: CalendarEvent[], date: string, timeZone: string): DayEvent[] {
  return events
    .map((e) => {
      if (e.all_day) return { date: e.start_time.slice(0, 10), minutes: -1, title: e.title };
      const c = localClock(new Date(e.start_time), timeZone);
      return { date: c.date, minutes: c.minutes, title: e.title };
    })
    .filter((e) => e.date === date)
    .sort((a, b) => a.minutes - b.minutes)
    .map((e) => ({
      title: e.title?.trim() || null,
      time: e.minutes < 0 ? null : `${String(Math.floor(e.minutes / 60)).padStart(2, "0")}:${String(e.minutes % 60).padStart(2, "0")}`,
    }));
}

const TEXT = {
  it: { one: (e: string) => `Domani: ${e}`, many: (n: number) => `Domani hai ${n} impegni`, at: "alle", event: "un impegno", andMore: (n: number) => `e altri ${n}`, cta: "Cosa indossi? Tocca e chiedi allo Stylist." },
  en: { one: (e: string) => `Tomorrow: ${e}`, many: (n: number) => `You have ${n} plans tomorrow`, at: "at", event: "an appointment", andMore: (n: number) => `and ${n} more`, cta: "What will you wear? Tap to ask your Stylist." },
  es: { one: (e: string) => `Mañana: ${e}`, many: (n: number) => `Mañana tienes ${n} planes`, at: "a las", event: "un plan", andMore: (n: number) => `y ${n} más`, cta: "¿Qué te pondrás? Toca y pregunta a tu Estilista." },
  fr: { one: (e: string) => `Demain : ${e}`, many: (n: number) => `Demain, vous avez ${n} rendez-vous`, at: "à", event: "un rendez-vous", andMore: (n: number) => `et ${n} autres`, cta: "Que porter ? Touchez pour demander à votre Styliste." },
} as const;

export function eventReminderMessage(language: string | null | undefined, events: DayEvent[]): { title: string; body: string } | null {
  if (!events.length) return null;
  const t = TEXT[(language ?? "").slice(0, 2) as keyof typeof TEXT] ?? TEXT.en;
  const label = (e: DayEvent) => `${e.title ?? t.event}${e.time ? ` ${t.at} ${e.time}` : ""}`;
  if (events.length === 1) return { title: t.one(events[0].title ?? t.event), body: `${events[0].time ? `${t.at[0].toUpperCase()}${t.at.slice(1)} ${events[0].time}. ` : ""}${t.cta}` };
  return { title: t.many(events.length), body: `${label(events[0])} ${t.andMore(events.length - 1)}. ${t.cta}` };
}
