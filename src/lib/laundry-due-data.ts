// «Forse da lavare» (laundry-due.ts) for one person, from the wears already logged: the same read for
// the app (the person's own client) and the morning notification (the service client). The
// temperature of each wear: the one saved with it, else the plan's forecast, else the day's high
// where the person lives (Open-Meteo, past days, free), else a guess from the month.
import { climateGuess, laundryLoad, washRule, WINDOW_DAYS, type Wear } from "./laundry-due";
import { isWearableNow } from "./wardrobe-storage";

export type LaundryDuePiece = { id: string; wears: number; load: number; lastTemp: number | null };

type Client = { from: (table: string) => any };
type Item = {
  id: string; category: string | null; subcategory: string | null; material: string[] | null;
  laundry_since: string | null; laundry_kind: string | null; archived?: boolean | null;
  stored_at?: string | null; active_loan_id?: string | null;
};

function minusDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Daily highs of the past weeks where the person lives, by date. Empty when unknown. */
async function pastHighs(lat: number, lon: number, timeZone: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&daily=temperature_2m_max&past_days=${WINDOW_DAYS + 1}&forecast_days=1&timezone=${encodeURIComponent(timeZone)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res || !res.ok) return out;
    const d = (await res.json()) as { daily?: { time?: string[]; temperature_2m_max?: (number | null)[] } };
    (d.daily?.time ?? []).forEach((date, i) => {
      const v = d.daily?.temperature_2m_max?.[i];
      if (typeof v === "number") out.set(date, v);
    });
  } catch { /* the month guess below */ }
  return out;
}

export async function laundryDue(
  client: Client,
  userId: string,
  opts: { today: string; latitude: number | null; longitude: number | null; timeZone: string },
): Promise<LaundryDuePiece[]> {
  const since = minusDays(opts.today, WINDOW_DAYS);
  const [{ data: items }, { data: events }] = await Promise.all([
    client.from("wardrobe_items")
      .select("id, category, subcategory, material, laundry_since, laundry_kind, archived, stored_at, active_loan_id")
      .eq("user_id", userId),
    client.from("wardrobe_events")
      .select("id, event_type, event_date, created_at, temperature, outfit_plan_id")
      .eq("user_id", userId).in("event_type", ["worn", "cleaned", "dry_cleaned", "laundry_ok"])
      .gte("event_date", minusDays(since, 1)),
  ]);
  const counted = ((items ?? []) as Item[]).filter((it) => !it.laundry_kind && !it.archived && isWearableNow(it as never) && washRule(it));
  type Ev = { id: string; event_type: string; event_date: string; created_at: string; temperature: number | null; outfit_plan_id: string | null };
  const evs = (events ?? []) as Ev[];
  if (!counted.length || !evs.some((e) => e.event_type === "worn")) return [];

  const { data: links } = await client.from("wardrobe_event_items").select("event_id, item_id").in("event_id", evs.map((e) => e.id));
  const itemsOf = new Map<string, string[]>();
  for (const l of (links ?? []) as { event_id: string; item_id: string }[]) itemsOf.set(l.event_id, [...(itemsOf.get(l.event_id) ?? []), l.item_id]);

  // Temperatures: saved with the wear, else the plan's, else the place's past highs, else the month.
  const worn = evs.filter((e) => e.event_type === "worn");
  const planIds = worn.filter((e) => e.temperature == null && e.outfit_plan_id).map((e) => e.outfit_plan_id!);
  const planTemp = new Map<string, number>();
  if (planIds.length) {
    const { data: plans } = await client.from("outfit_plans").select("id, weather_temp").in("id", planIds);
    for (const p of (plans ?? []) as { id: string; weather_temp: number | null }[]) if (p.weather_temp != null) planTemp.set(p.id, p.weather_temp);
  }
  const needPlace = worn.some((e) => e.temperature == null && !(e.outfit_plan_id && planTemp.has(e.outfit_plan_id)));
  const highs = needPlace && opts.latitude != null && opts.longitude != null
    ? await pastHighs(opts.latitude, opts.longitude, opts.timeZone) : new Map<string, number>();
  const tempOf = (e: Ev): number =>
    e.temperature ?? (e.outfit_plan_id ? planTemp.get(e.outfit_plan_id) : undefined) ?? highs.get(e.event_date) ?? climateGuess(e.event_date, opts.latitude);

  const wearsOf = new Map<string, Wear[]>();
  const lastOf = (type: string[]) => {
    const m = new Map<string, string>();
    for (const e of evs) if (type.includes(e.event_type)) for (const id of itemsOf.get(e.id) ?? []) {
      const at = e.created_at > (m.get(id) ?? "") ? e.created_at : m.get(id)!;
      m.set(id, at);
    }
    return m;
  };
  for (const e of worn) for (const id of itemsOf.get(e.id) ?? []) wearsOf.set(id, [...(wearsOf.get(id) ?? []), { date: e.event_date, temp: tempOf(e) }]);
  const washedAt = lastOf(["cleaned", "dry_cleaned"]);
  const checkedAt = lastOf(["laundry_ok"]);

  const due: LaundryDuePiece[] = [];
  for (const it of counted) {
    const wears = wearsOf.get(it.id);
    if (!wears?.length) continue;
    const r = laundryLoad({ rule: washRule(it)!, wears, lastWash: washedAt.get(it.id) ?? null, lastCheck: checkedAt.get(it.id) ?? null, today: opts.today });
    if (r.due) due.push({ id: it.id, wears: r.wears.length, load: r.load, lastTemp: r.wears.length ? Math.round(r.wears[r.wears.length - 1].temp!) : null });
  }
  return due.sort((a, b) => b.load - a.load);
}
