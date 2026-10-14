/** Date ("YYYY-MM-DD") and time ("HH:MM") of an instant in a time zone; UTC when the zone is
 *  missing or unknown. */
export function localDateTime(iso: string, timeZone?: string): { date: string; time: string } {
  const d = new Date(iso);
  const fmt = (tz: string) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
  try {
    return fmt(timeZone || "UTC");
  } catch {
    return fmt("UTC");
  }
}
