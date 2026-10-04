// Work days: the person leaves home before work starts and comes back after it ends, and a day forecast
// only gives the minimum and maximum. A 13°C morning and a 27°C afternoon need ONE removable layer
// (blazer, cardigan over a top, light jacket) that comes off during the day — the work-outfit generator
// used to see only one "daytime" number, so sometimes it added a layer and sometimes not.

/** Temperature at a time of day from the day's min (≈ 6:00) and max (≈ 15:00), on a smooth curve. */
export function temperatureAt(hour: number, tempMin: number, tempMax: number): number {
  const h = ((hour % 24) + 24) % 24;
  const t = h < 6 ? h + 24 : h; // after midnight: still cooling towards the next morning's minimum
  const f = t <= 15
    ? (1 - Math.cos((Math.PI * (t - 6)) / 9)) / 2
    : (1 + Math.cos((Math.PI * (t - 15)) / 15)) / 2;
  return tempMin + (tempMax - tempMin) * f;
}

function hoursOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

export type CommuteWeather = {
  /** Leaving home: half an hour before work starts. */
  leaveAt: string; leaveTemp: number;
  backAt: string; backTemp: number;
  peakTemp: number;
  /** Cool when leaving and clearly warmer later: one layer to take off during the day. */
  needsRemovableLayer: boolean;
};

const clock = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;

export function commuteWeather(workStart: string, workEnd: string, tempMin: number, tempMax: number): CommuteWeather | null {
  const start = hoursOf(workStart), end = hoursOf(workEnd);
  if (start == null || end == null) return null;
  const leave = start - 0.5;
  const back = end + 0.5;
  const leaveTemp = Math.round(temperatureAt(leave, tempMin, tempMax));
  const backTemp = Math.round(temperatureAt(back, tempMin, tempMax));
  const peakTemp = Math.round(tempMax);
  const coolestCommute = Math.min(leaveTemp, backTemp);
  const needsRemovableLayer = coolestCommute <= 18 && peakTemp - coolestCommute >= 7;
  return { leaveAt: clock(leave), leaveTemp, backAt: clock(back), backTemp, peakTemp, needsRemovableLayer };
}

/** The instruction for the outfit generator. */
export function commuteLayerHint(c: CommuteWeather): string {
  return `COMMUTE: the person leaves home around ${c.leaveAt} at about ${c.leaveTemp}°C, the day reaches about ${c.peakTemp}°C, and they head home around ${c.backAt} at about ${c.backTemp}°C. `
    + `Include exactly ONE removable layer for the cool parts of the day — a blazer, a light jacket, or a cardigan/open knit WITH a top under it — that comes off once it warms up; everything under it must be light enough for ${c.peakTemp}°C. This overrides the general rules about leaving out jackets, blazers and layers when it's warm: the layer is for the cool commute, not for the afternoon (with a blazer, keep the base light — a t-shirt or tank).`;
}
