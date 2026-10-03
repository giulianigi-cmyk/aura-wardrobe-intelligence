// Wardrobe rotation: every outfit engine used to receive the wardrobe with no idea of what had
// been worn when, in the order the wardrobe is listed (newest pieces first). Models favour what
// they see first, so the same recent pieces kept coming back and older ones were never proposed.
// This module gives every engine the same three things:
//  - the wear history of each piece (days since last worn, times worn), read from wardrobe_items;
//  - a catalog ORDER that puts long-unworn and never-worn pieces first (with some randomness, so
//    the order itself is not a fixed preference);
//  - the set of pieces worn in the last couple of days, to keep out of today's look when the same
//    category still has alternatives.

export type WearHistory = { lastWorn: string | null; wornCount: number };

/** Pieces worn within this many days are kept out of a look for TODAY when possible. */
export const RECENT_DAYS = 2;
/** Treated as "forgotten" — worth bringing back. */
export const FORGOTTEN_DAYS = 30;

export function daysSince(dateIso: string | null | undefined, todayIso: string): number | null {
  if (!dateIso) return null;
  const a = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Reads the wear history of the given pieces (own rows only — RLS applies to the caller's client). */
type WearRowsQuery = PromiseLike<{ data: unknown }> & { in: (col: string, values: string[]) => WearRowsQuery; eq: (col: string, v: string) => WearRowsQuery };
type WearHistoryClient = { from: (table: "wardrobe_items") => { select: (cols: string) => WearRowsQuery } };

export async function loadWearHistory(
  supabase: WearHistoryClient,
  userId: string,
  ids: string[],
): Promise<Map<string, WearHistory>> {
  const out = new Map<string, WearHistory>();
  if (!ids.length) return out;
  try {
    const { data } = await supabase.from("wardrobe_items")
      .select("id, last_worn, worn_count").eq("user_id", userId).in("id", ids.slice(0, 1000));
    for (const r of (data ?? []) as { id: string; last_worn: string | null; worn_count: number | null }[]) {
      out.set(r.id, { lastWorn: r.last_worn, wornCount: r.worn_count ?? 0 });
    }
  } catch (e) {
    // Rotation is a preference, never a reason to fail a suggestion.
    console.error("[AURA rotation] wear history read failed, continuing without it", e);
  }
  return out;
}

/** Rotation priority: higher = should be proposed sooner. Never worn ≈ not worn for a long time;
 *  pieces worn often get a small penalty so the same favourites don't always win. */
export function rotationPriority(h: WearHistory | undefined, todayIso: string): number {
  const days = daysSince(h?.lastWorn ?? null, todayIso);
  const base = days == null ? 120 : Math.min(days, 180);
  return base - Math.min(h?.wornCount ?? 0, 30) * 0.5;
}

/** Catalog order for the model: long-unworn first, with a random factor (±35%) so the order varies
 *  from one generation to the next and is not read as a fixed ranking. `rand` is injectable for tests. */
export function rotationOrder<T extends { id: string }>(
  items: T[],
  history: Map<string, WearHistory>,
  todayIso: string,
  rand: () => number = Math.random,
): T[] {
  return items
    .map((it) => ({ it, k: rotationPriority(history.get(it.id), todayIso) * (0.65 + rand() * 0.7) + rand() }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.it);
}

/** Pieces worn in the last RECENT_DAYS days. */
export function recentlyWornIds(history: Map<string, WearHistory>, todayIso: string, withinDays = RECENT_DAYS): Set<string> {
  const out = new Set<string>();
  for (const [id, h] of history) {
    const d = daysSince(h.lastWorn, todayIso);
    if (d != null && d <= withinDays) out.add(id);
  }
  return out;
}

/** Drops recently worn pieces, category by category — but never empties a category (or leaves
 *  fewer than `minPerCategory` pieces in it): if everything in it was worn recently, it stays. */
export function withoutRecentPerCategory<T extends { id: string; category?: string | null }>(
  items: T[],
  recent: Set<string>,
  minPerCategory = 1,
): T[] {
  if (!recent.size) return items;
  const byCat = new Map<string, T[]>();
  for (const it of items) {
    const k = it.category ?? "";
    byCat.set(k, [...(byCat.get(k) ?? []), it]);
  }
  const keep = new Set<string>();
  for (const list of byCat.values()) {
    const fresh = list.filter((it) => !recent.has(it.id));
    for (const it of fresh.length >= minPerCategory ? fresh : list) keep.add(it.id);
  }
  return items.filter((it) => keep.has(it.id));
}

/** Fields added to each catalog entry the model sees. */
export function wearFields(h: WearHistory | undefined, todayIso: string): { lastWornDaysAgo: number | null; timesWorn: number } {
  return { lastWornDaysAgo: daysSince(h?.lastWorn ?? null, todayIso), timesWorn: h?.wornCount ?? 0 };
}

export const ROTATION_PROMPT_RULE =
  "ROTATION — each wardrobe entry has lastWornDaysAgo (null = never worn since it was added to AURA) and timesWorn. " +
  "The person wants to rediscover their whole wardrobe, not see the same recent pieces again: prefer pieces not worn for a while, " +
  `and whenever the occasion and weather allow, build in at least one piece not worn for ${FORGOTTEN_DAYS}+ days (or never worn). ` +
  `Avoid pieces worn in the last ${RECENT_DAYS} days unless nothing else suitable exists. ` +
  "The order of the wardrobe list is NOT a preference — never pick a piece because it appears early. " +
  "Rotation never overrides the hard rules (weather, occasion, dress preferences, venue requirements).";
