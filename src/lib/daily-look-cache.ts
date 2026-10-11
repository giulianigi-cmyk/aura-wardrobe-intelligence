// When Home's cached looks of the day are still good. They used to be thrown away whenever ANY
// piece was added or edited (the cache key held the latest edit time): while someone uploads their
// wardrobe, every visit to Home regenerated the looks — 141 AI calls in a day for two people.
// Now a cached look stays for the day unless something that matters changes.

/** Cache key: wardrobe size + temperature band. Older rows ("count:latestEdit:band") still parse. */
export function lookFingerprint(activeCount: number, tempBand: string): string {
  return `${activeCount}:${tempBand}`;
}

function parse(fp: string): { count: number; band: string } | null {
  const parts = fp.split(":");
  const count = Number(parts[0]);
  if (!Number.isFinite(count) || parts.length < 2) return null;
  return { count, band: parts[parts.length - 1] };
}

/** Regenerate only when: it is another day, the temperature crossed a band, a piece in the cached
 *  looks is no longer available (deleted, archived, lent), or the wardrobe has grown enough to
 *  offer genuinely new looks (+25%, or crossing 10 pieces — weekly outfits start there). */
export function cachedLooksStillFresh(
  row: { date: string; fingerprint: string; itemIds: string[] },
  now: { today: string; activeCount: number; tempBand: string; availableIds: Set<string> },
): boolean {
  if (row.date !== now.today) return false;
  const fp = parse(row.fingerprint);
  if (!fp || fp.band !== now.tempBand) return false;
  if (!row.itemIds.length || !row.itemIds.every((id) => now.availableIds.has(id))) return false;
  if (fp.count < 10 && now.activeCount >= 10) return false;
  if (now.activeCount > Math.max(fp.count * 1.25, fp.count + 3)) return false;
  return true;
}
