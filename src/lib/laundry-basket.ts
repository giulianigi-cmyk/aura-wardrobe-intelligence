// Cesto del bucato, tintoria e promemoria dei prestiti. Pure, no DB.
//
// - Cesto (laundry_kind 'basket'): the piece is waiting to be washed. Nothing proposes it, and after
//   10 days it counts as back in the wardrobe on its own (someone living alone washes whites, darks
//   and colours once there is a full load) — the app then clears the field and says so.
// - Tintoria ('dry_cleaner'): the piece is out of the house, so it never comes back on its own; a
//   reminder after 7 days ("hai ritirato i capi?"), then every 3 days.
// - Sport pieces go to the basket by themselves when an outfit is logged as worn.
// - Loans have no return date: a reminder 14 days after the loan, then 14 days after each
//   "ce l'ha ancora" (the loan's updated_at), until "ripreso".

export type LaundryKind = "basket" | "dry_cleaner";
export type LaundryFields = { laundry_since?: string | null; laundry_kind?: string | null };

const DAY = 86_400_000;
export const BASKET_RETURN_DAYS = 10;
export const DRY_CLEANER_REMIND_DAYS = 7;
export const DRY_CLEANER_REPEAT_DAYS = 3;
export const LOAN_REMIND_DAYS = 14;

function daysSince(iso: string | null | undefined, now: number): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor((now - t) / DAY) : null;
}

/** In the basket for less than 10 days, or at the dry cleaner: not wearable now. */
export function isInLaundry(item: LaundryFields, now = Date.now()): boolean {
  const days = daysSince(item.laundry_since, now);
  if (days == null) return false;
  if (item.laundry_kind === "dry_cleaner") return true;
  return days < BASKET_RETURN_DAYS;
}

/** A basket piece whose 10 days are over: the app clears its field and tells the person. */
export function basketExpired(item: LaundryFields, now = Date.now()): boolean {
  const days = daysSince(item.laundry_since, now);
  return item.laundry_kind !== "dry_cleaner" && days != null && days >= BASKET_RETURN_DAYS;
}

/** At the dry cleaner for 7 days or more: shown in the app until collected. */
export function dryCleanerOverdue(item: LaundryFields, now = Date.now()): boolean {
  const days = daysSince(item.laundry_since, now);
  return item.laundry_kind === "dry_cleaner" && days != null && days >= DRY_CLEANER_REMIND_DAYS;
}

/** The days the morning notification asks about the dry cleaner: day 7, then every 3 days. */
export function dryCleanerPushDay(item: LaundryFields, now = Date.now()): boolean {
  const days = daysSince(item.laundry_since, now);
  return item.laundry_kind === "dry_cleaner" && days != null && days >= DRY_CLEANER_REMIND_DAYS
    && (days - DRY_CLEANER_REMIND_DAYS) % DRY_CLEANER_REPEAT_DAYS === 0;
}

export type LoanFields = { loaned_at: string; updated_at?: string | null; returned_at?: string | null };

/** Days since the loan or since the last "ce l'ha ancora", whichever is later. */
function loanAnchorDays(loan: LoanFields, now: number): number | null {
  if (loan.returned_at) return null;
  const a = Date.parse(loan.loaned_at.length <= 10 ? `${loan.loaned_at}T00:00:00Z` : loan.loaned_at);
  const b = loan.updated_at ? Date.parse(loan.updated_at) : NaN;
  const anchor = Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0);
  return anchor ? Math.floor((now - anchor) / DAY) : null;
}

/** 14 days or more since the loan or the last "ce l'ha ancora": asked in the app. */
export function loanReminderDue(loan: LoanFields, now = Date.now()): boolean {
  const days = loanAnchorDays(loan, now);
  return days != null && days >= LOAN_REMIND_DAYS;
}

/** The day the morning notification asks about a loan: exactly 14 days after the anchor. */
export function loanPushDay(loan: LoanFields, now = Date.now()): boolean {
  return loanAnchorDays(loan, now) === LOAN_REMIND_DAYS;
}

/** Sport pieces go to the basket after one wear. */
export function isSportPiece(item: { category?: string | null; occasion?: string | null }): boolean {
  if (item.category === "Activewear") return true;
  const tags = (item.occasion ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return tags.length > 0 && tags.every((t) => /sport|gym|training|running|yoga/i.test(t));
}
