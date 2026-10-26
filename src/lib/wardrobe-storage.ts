// Cambio stagione — pieces put away for the season (garage, cellar, vacuum bags…). Still owned:
// they count in the analyses and the purchase advisor still knows about them, but nothing proposes
// them (look of the day, Stylist, plans, trips, try-on, wear detection) until they are brought back.
// stored_at = when the piece was put away; null = it is in the wardrobe. Rows read before the
// column existed simply have no stored_at, so they read as "in the wardrobe".

export type AvailabilityFields = { archived?: boolean | null; active_loan_id?: string | null; stored_at?: string | null };

export function isInStorage(item: { stored_at?: string | null }): boolean {
  return Boolean(item.stored_at);
}

/** Physically in the wardrobe and wearable now: not archived (sold/donated), not lent out,
 *  not put away in the cambio stagione. */
export function isWearableNow(item: AvailabilityFields): boolean {
  return !item.archived && !item.active_loan_id && !item.stored_at;
}

/** The seasons a trip's daytime highs call for: a beach week in October needs summer pieces, a
 *  ski week in July winter ones. Ranges overlap on purpose (a 20° day takes spring or summer). */
export function seasonsForTemperatures(dailyMax: number[]): Set<string> {
  const out = new Set<string>();
  for (const t of dailyMax) {
    if (t >= 22) out.add("Summer");
    if (t >= 14 && t < 26) { out.add("Spring"); out.add("Autumn"); }
    if (t < 14) out.add("Autumn");
    if (t < 10) out.add("Winter");
  }
  return out;
}

/** Stored pieces this trip's climate calls for: put away (not sold, not lent) and tagged for one
 *  of the trip's seasons. Pieces with no season tag are left out: nothing says they'd fit. */
export function storedPiecesForSeasons<T extends AvailabilityFields & { id: string; season?: string | null }>(items: T[], seasons: Set<string>): T[] {
  if (!seasons.size) return [];
  return items.filter((it) => {
    if (!isInStorage(it) || it.archived || it.active_loan_id) return false;
    const s = (it.season ?? "").toLowerCase();
    if (!s) return false;
    if (s.includes("all")) return true;
    return Array.from(seasons).some((season) => s.includes(season.toLowerCase()));
  });
}

type SeasonItem = AvailabilityFields & { id: string; season?: string | null; last_worn?: string | null };
export type SeasonChangePlan<T> = {
  /** Seasons the next two weeks call for; empty when there is no forecast. */
  seasons: Set<string>;
  /** In the wardrobe, tagged only for seasons the coming weeks don't need. */
  putAway: T[];
  /** Out of season too, but kept out: planned in the calendar or a trip, or worn recently. */
  keepOut: { item: T; reason: "planned" | "recent" }[];
  /** In the cambio stagione and tagged for a season the coming weeks need. */
  bringBack: T[];
};

/** Days a piece counts as "worn recently" (you are still using it, out of season or not). */
export const RECENT_WEAR_DAYS = 30;

/** "Cosa mettere via?": from the daytime highs of the next two weeks, which pieces to put away,
 *  which to keep out anyway and which to take back. Rules only (no AI): a piece with no season tag,
 *  or tagged All Seasons, is never moved either way. */
export function seasonChangeSuggestions<T extends SeasonItem>(
  items: T[],
  dailyMax: number[],
  opts: { today: string; plannedIds: Set<string> },
): SeasonChangePlan<T> {
  const seasons = seasonsForTemperatures(dailyMax);
  const plan: SeasonChangePlan<T> = { seasons, putAway: [], keepOut: [], bringBack: [] };
  if (!seasons.size) return plan;
  const recentSince = new Date(`${opts.today}T00:00:00Z`);
  recentSince.setUTCDate(recentSince.getUTCDate() - RECENT_WEAR_DAYS);
  const recentIso = recentSince.toISOString().slice(0, 10);
  for (const it of items) {
    if (it.archived || it.active_loan_id) continue;
    const tags = (it.season ?? "").toLowerCase();
    if (!tags || tags.includes("all")) continue;
    const fits = Array.from(seasons).some((s) => tags.includes(s.toLowerCase()));
    if (isInStorage(it)) {
      if (fits) plan.bringBack.push(it);
    } else if (!fits) {
      if (opts.plannedIds.has(it.id)) plan.keepOut.push({ item: it, reason: "planned" });
      else if (it.last_worn && it.last_worn >= recentIso) plan.keepOut.push({ item: it, reason: "recent" });
      else plan.putAway.push(it);
    }
  }
  return plan;
}
