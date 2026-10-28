// Fallback forecast from MET Norway (api.met.no, free, no key): used when Open-Meteo refuses the
// server's requests (it answered "503" to every hourly run, so no planned outfit was ever checked
// and no rain alert could go out). MET gives hourly values in UTC; this turns them into the same
// per-day shape as Open-Meteo (max/min temperature, chance of rain, a WMO weather code).

export type DailyWeather = { tempMax: number; tempMin: number; precipitation: number; code: number };

/** Seconds a time zone is ahead of UTC at `at` (DST included). Invalid zone → 0. */
export function utcOffsetSeconds(timeZone: string, at: Date = new Date()): number {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(at).map((x) => [x.type, x.value]),
    );
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 1000);
  } catch {
    return 0;
  }
}

/** MET symbol code ("lightrainshowers_day", "heavyrain", "partlycloudy_night"…) → WMO code. */
export function symbolToWmo(symbol: string): number {
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return 95;
  if (s.includes("sleet")) return 66;
  if (s.includes("snow")) return s.includes("heavy") ? 75 : s.includes("light") ? 71 : 73;
  if (s.includes("rainshowers")) return s.includes("heavy") ? 82 : 80;
  if (s.includes("rain")) return s.includes("heavy") ? 65 : s.includes("light") ? 61 : 63;
  if (s === "fog") return 45;
  if (s === "cloudy") return 3;
  if (s === "partlycloudy") return 2;
  if (s === "fair") return 1;
  return 0; // clearsky
}

const WET = (code: number) => code >= 51 && code !== 71 && code !== 73 && code !== 75;

type MetnoJson = {
  properties?: { timeseries?: {
    time: string;
    data: {
      instant?: { details?: { air_temperature?: number } };
      next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
      next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    };
  }[] };
};

/** Per local day. Chance of rain is estimated from the share of daytime hours (07–21) with rain
 *  in the forecast (MET's compact feed has no probability field). */
export function metnoDaily(json: MetnoJson, utcOffset: number): Record<string, DailyWeather> {
  const days = new Map<string, { temps: number[]; dayHours: number; wetHours: number; worst: number; codes: number[] }>();
  for (const t of json.properties?.timeseries ?? []) {
    const local = new Date(Date.parse(t.time) + utcOffset * 1000);
    const date = local.toISOString().slice(0, 10);
    const hour = local.getUTCHours();
    const d = days.get(date) ?? { temps: [], dayHours: 0, wetHours: 0, worst: 0, codes: [] };
    const temp = t.data.instant?.details?.air_temperature;
    if (typeof temp === "number") d.temps.push(temp);
    const next = t.data.next_1_hours ?? t.data.next_6_hours;
    const symbol = next?.summary?.symbol_code;
    if (symbol && hour >= 7 && hour <= 21) {
      const code = symbolToWmo(symbol);
      d.dayHours++;
      d.codes.push(code);
      if (WET(code) || (next?.details?.precipitation_amount ?? 0) >= 0.2) d.wetHours++;
      if (WET(code) && code > d.worst) d.worst = code;
    }
    days.set(date, d);
  }
  const out: Record<string, DailyWeather> = {};
  for (const [date, d] of days) {
    if (!d.temps.length) continue;
    const share = d.dayHours ? d.wetHours / d.dayHours : 0;
    const common = d.codes.sort((a, b) => d.codes.filter((c) => c === b).length - d.codes.filter((c) => c === a).length)[0] ?? 0;
    out[date] = {
      tempMax: Math.max(...d.temps),
      tempMin: Math.min(...d.temps),
      precipitation: d.wetHours ? Math.min(95, Math.round(40 + 60 * share)) : 5,
      code: d.worst || common,
    };
  }
  return out;
}

export async function fetchMetnoDaily(lat: number, lon: number, utcOffset: number): Promise<Record<string, DailyWeather> | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
    // MET requires an identifying User-Agent (their terms of service).
    const res = await fetch(url, {
      headers: { "User-Agent": "Nimbea/1.0 https://nimbea.app info@nimbea.app" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const days = metnoDaily((await res.json()) as MetnoJson, utcOffset);
    return Object.keys(days).length ? days : null;
  } catch {
    return null;
  }
}
