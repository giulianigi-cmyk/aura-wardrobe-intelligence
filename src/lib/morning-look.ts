// Morning look notification: at the time each person chooses (Settings › Notifiche), a push saying
// today's look is ready, with the day's temperatures. Which times can be chosen, whether one is due
// in the person's own time zone, and the text in the four languages. Sent by morning-push.server.ts.

/** Choosable times: every 15 minutes from 05:00 to 12:00 (the sender runs every 15 minutes). */
export const MORNING_TIMES: string[] = Array.from({ length: (12 - 5) * 4 + 1 }, (_, i) => {
  const m = 5 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
export const DEFAULT_MORNING_TIME = "07:30";

export type MorningPrefs = { morning_look?: boolean; morning_look_time?: string };

export function morningTimeOf(prefs: MorningPrefs | null | undefined): string {
  const t = prefs?.morning_look_time;
  return t && MORNING_TIMES.includes(t) ? t : DEFAULT_MORNING_TIME;
}

/** Date and minutes since midnight in a time zone. */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Due from the chosen time until WINDOW minutes later: the sender runs every 15 minutes, and a
 *  run that starts a little late still sends. Once a day (the caller records the date). */
export const WINDOW_MINUTES = 30;
export function isDue(time: string, localMinutes: number): boolean {
  const [h, m] = time.split(":").map(Number);
  const target = h * 60 + m;
  return localMinutes >= target && localMinutes < target + WINDOW_MINUTES;
}

export type DayWeather = { min: number; max: number; rainChance: number | null };

const TEXT = {
  it: { title: "Il tuo look di oggi è pronto", weather: (w: DayWeather) => `Oggi tra ${w.min}° e ${w.max}°${w.rainChance != null && w.rainChance >= 50 ? ", possibile pioggia" : ""}.`, cta: "Apri AURA per vedere cosa indossare." },
  en: { title: "Today's look is ready", weather: (w: DayWeather) => `Today ${w.min}° to ${w.max}°${w.rainChance != null && w.rainChance >= 50 ? ", rain likely" : ""}.`, cta: "Open AURA to see what to wear." },
  es: { title: "Tu look de hoy está listo", weather: (w: DayWeather) => `Hoy entre ${w.min}° y ${w.max}°${w.rainChance != null && w.rainChance >= 50 ? ", posible lluvia" : ""}.`, cta: "Abre AURA para ver qué ponerte." },
  fr: { title: "Votre look du jour est prêt", weather: (w: DayWeather) => `Aujourd'hui entre ${w.min}° et ${w.max}°${w.rainChance != null && w.rainChance >= 50 ? ", pluie probable" : ""}.`, cta: "Ouvrez AURA pour voir quoi porter." },
} as const;

export function morningMessage(language: string | null | undefined, weather: DayWeather | null): { title: string; body: string } {
  const t = TEXT[(language ?? "").slice(0, 2) as keyof typeof TEXT] ?? TEXT.en;
  return { title: t.title, body: weather ? `${t.weather(weather)} ${t.cta}` : t.cta };
}
