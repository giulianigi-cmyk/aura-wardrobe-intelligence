// Lista dei desideri e salvadanaio. Pure, no DB.
//
// - The wished pieces are kept in the person's order of priority. For each one the person chooses how
//   to get there: a date by which they would like to buy it, or an amount they put aside for it each
//   month.
// - The money put aside is a running total of what the person says they saved: monthly amounts,
//   the price of a piece they sold, a purchase they skipped, or any other amount. It moves no real
//   money — it is a note of what is set aside, and buying a wished piece takes its price out of it.
// - The plan: what is set aside goes to the pieces in order of priority. For a piece with a date, what
//   is still missing is spread over the months left; for a piece with a monthly amount, the plan says
//   in which month it is reached. The sum is what to put aside a month.
import { CPW_YEARS, costPerWear, estimateWears, priceContext, rotationPool, type WearProfile } from "./purchase-context";
import { convertCurrency } from "./currency-rates";
import type { WardrobeItem } from "./aura-types";

export type SavingsSource = "monthly" | "sold" | "skipped" | "manual" | "spent";
export const SAVINGS_SOURCES: readonly SavingsSource[] = ["monthly", "sold", "skipped", "manual", "spent"];

export type SavingsEntryLike = { amount: number; currency?: string | null; source: string; entry_date: string };

export type WishLike = {
  id: string;
  price: number | null;
  currency?: string | null;
  priority: number;
  target_date: string | null;
  /** What the person puts aside for it each month (instead of a date). */
  monthly_amount?: number | null;
  bought_at: string | null;
  created_at?: string | null;
};

const toEur = (amount: number, currency: string | null | undefined) =>
  convertCurrency(amount, (currency ?? "EUR").toUpperCase(), "EUR");

/** What is set aside now, in euros: everything saved minus what was spent on wished pieces, never
 *  below zero. */
export function savingsBalance(entries: readonly SavingsEntryLike[]): number {
  const total = entries.reduce((sum, e) => {
    const eur = toEur(Math.abs(Number(e.amount) || 0), e.currency);
    return e.source === "spent" ? sum - eur : sum + eur;
  }, 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

/** The pieces still wished (not bought), in the person's order: priority first, then the oldest. */
export function openWishes<T extends WishLike>(items: readonly T[]): T[] {
  return items
    .filter((w) => !w.bought_at)
    .sort((a, b) => a.priority - b.priority || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

/** Months left until `target` (a YYYY-MM-DD date), counting the current month: a date later this
 *  month is 1, next month 2. 0 when the date has passed. */
export function monthsLeft(target: string, now = new Date()): number {
  const [y, m, d] = target.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return 0;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (Date.UTC(y, m - 1, d) < today) return 0;
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1;
}

export type PlanRow = {
  id: string;
  /** Price in euros, null when unknown. */
  priceEur: number | null;
  /** What is already set aside for it (the savings go to the pieces in order of priority). */
  covered: number;
  remaining: number;
  /** Months left until its date, or months still needed with its monthly amount (counting the
   *  current month); null without either. */
  months: number | null;
  /** To put aside a month for it; null without a date or monthly amount, or without a price. */
  monthly: number | null;
  /** With a monthly amount: the first day of the month it is reached (YYYY-MM-01). */
  reachedOn: string | null;
  /** Its date has passed and it is not covered yet. */
  late: boolean;
};

export type SavingsPlan = {
  rows: PlanRow[];
  /** To put aside a month for all the pieces together (rounded up to the euro). */
  monthlyTotal: number;
  /** What the person actually put aside a month, on average over the last 3 months with any saving;
   *  null with no history. */
  usualMonthly: number | null;
  /** The dates ask for more than is realistic: a date already passed, or a monthly amount well above
   *  (1.5 times) what the person usually manages. */
  unrealistic: boolean;
};

/** Average of what was put aside per month (monthly, sold, skipped, manual) over the last 3 calendar
 *  months that have any saving. */
export function usualMonthlySaving(entries: readonly SavingsEntryLike[], now = new Date()): number | null {
  const byMonth = new Map<string, number>();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const e of entries) {
    if (e.source === "spent") continue;
    const month = e.entry_date.slice(0, 7);
    if (month > current) continue;
    byMonth.set(month, (byMonth.get(month) ?? 0) + toEur(Math.abs(Number(e.amount) || 0), e.currency));
  }
  const recent = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3);
  if (!recent.length) return null;
  return Math.round(recent.reduce((s, [, v]) => s + v, 0) / recent.length);
}

export function savingsPlan<T extends WishLike>(items: readonly T[], entries: readonly SavingsEntryLike[], now = new Date()): SavingsPlan {
  let left = savingsBalance(entries);
  const rows: PlanRow[] = openWishes(items).map((w) => {
    const priceEur = w.price != null && w.price > 0 ? Math.round(toEur(w.price, w.currency) * 100) / 100 : null;
    const covered = priceEur == null ? 0 : Math.min(left, priceEur);
    left -= covered;
    const remaining = priceEur == null ? 0 : Math.round((priceEur - covered) * 100) / 100;
    const perMonth = !w.target_date && w.monthly_amount != null && w.monthly_amount > 0 ? Number(w.monthly_amount) : null;
    if (perMonth != null && priceEur != null) {
      if (remaining <= 0) return { id: w.id, priceEur, covered, remaining, months: 0, monthly: 0, reachedOn: monthStart(now, 0), late: false };
      const months = Math.ceil(remaining / perMonth);
      return { id: w.id, priceEur, covered, remaining, months, monthly: Math.min(perMonth, Math.ceil(remaining)), reachedOn: monthStart(now, months - 1), late: false };
    }
    const months = w.target_date ? monthsLeft(w.target_date, now) : null;
    const late = months === 0 && remaining > 0;
    const monthly = priceEur == null || months == null ? null : remaining <= 0 ? 0 : months === 0 ? remaining : Math.ceil(remaining / months);
    return { id: w.id, priceEur, covered, remaining, months, monthly, reachedOn: null, late };
  });
  const monthlyTotal = Math.ceil(rows.reduce((s, r) => s + (r.monthly ?? 0), 0));
  const usualMonthly = usualMonthlySaving(entries, now);
  const unrealistic = rows.some((r) => r.late) || (usualMonthly != null && usualMonthly > 0 && monthlyTotal > usualMonthly * 1.5);
  return { rows, monthlyTotal, usualMonthly, unrealistic };
}

function monthStart(now: Date, plus: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + plus, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Whether this month's "Hai messo da parte X €?" is still to be asked: there is something to save for
 *  and no monthly amount was noted this month. */
export function monthlyQuestionDue(monthlyAmount: number, entries: readonly SavingsEntryLike[], now = new Date()): boolean {
  if (!(monthlyAmount > 0)) return false;
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return !entries.some((e) => e.source === "monthly" && e.entry_date.startsWith(month));
}

export type WishPieceShape = {
  category: string | null; subcategory: string | null; occasion?: string | null; formality?: number | null;
  price: number | null; currency?: string | null; material?: string[] | null;
};

/** What a wished piece would cost per wear over two years, as in "Devo comprarlo?": from the
 *  person's own history and prices when there is enough of them, otherwise from how usable the piece
 *  is (a watch or a ring is worn nearly every day, an evening dress a few times a year), shared with
 *  the similar pieces already owned. Null without a price or a type. */
export function wishCostPerWear(wish: WishPieceShape, wardrobe: WardrobeItem[], now = new Date()): { wearsPerYear: number; costPerWearEur: number } | null {
  if (wish.price == null || !(wish.price > 0) || !wish.subcategory) return null;
  const profile: WearProfile = {
    category: wish.category, subcategory: wish.subcategory, formality: wish.formality ?? null,
    dayEvening: /evening|formal|cocktail|gala|party/i.test(wish.occasion ?? "") && !/everyday|work|casual|weekend/i.test(wish.occasion ?? "") ? "evening" : null,
  };
  const price = priceContext(
    { price: String(wish.price), currency: wish.currency ?? "EUR", category: wish.category, subcategory: wish.subcategory, material: wish.material?.[0] ?? null },
    wardrobe,
  );
  const cpw = price ? costPerWear(profile, wardrobe, price, now) : null;
  if (cpw) return { wearsPerYear: cpw.wearsPerYear, costPerWearEur: cpw.costPerWearEur };
  const { wearsPerYear } = estimateWears(profile, rotationPool(profile, wardrobe).effective);
  const eur = toEur(wish.price, wish.currency);
  return { wearsPerYear, costPerWearEur: Math.max(0, Math.round((eur / (wearsPerYear * CPW_YEARS)) * 100) / 100) };
}
