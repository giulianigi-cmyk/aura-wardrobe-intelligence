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
