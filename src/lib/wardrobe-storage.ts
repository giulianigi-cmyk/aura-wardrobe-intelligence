// Cambio armadio — pieces put away for the season (garage, cellar, vacuum bags…). Still owned:
// they count in the analyses and the purchase advisor still knows about them, but nothing proposes
// them (look of the day, Stylist, plans, trips, try-on, wear detection) until they are brought back.
// stored_at = when the piece was put away; null = it is in the wardrobe. Rows read before the
// column existed simply have no stored_at, so they read as "in the wardrobe".

export type AvailabilityFields = { archived?: boolean | null; active_loan_id?: string | null; stored_at?: string | null };

export function isInStorage(item: { stored_at?: string | null }): boolean {
  return Boolean(item.stored_at);
}

/** Physically in the wardrobe and wearable now: not archived (sold/donated), not lent out,
 *  not put away in the cambio armadio. */
export function isWearableNow(item: AvailabilityFields): boolean {
  return !item.archived && !item.active_loan_id && !item.stored_at;
}
