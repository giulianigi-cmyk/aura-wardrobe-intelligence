// «Al tuo guardaroba manca» is worked out by the AI each time the Shop opens. The same wardrobe gets
// the same answer, so the last suggestion is kept on this device and shown again while the wardrobe
// is unchanged, for at most a day (the season moves on). "Ce l'ho già" asks for a new one.

export const GAP_CACHE_MS = 24 * 60 * 60 * 1000;

/** A short fingerprint of what the analysis is given: any piece added, removed or edited changes it. */
export function gapSignature(items: readonly unknown[]): string {
  const text = JSON.stringify(items);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${items.length}:${(h >>> 0).toString(36)}`;
}

type Saved<T> = { sig: string; at: number; suggestion: T };

const key = (userId: string) => `aura.gapSuggestion.${userId}`;

/** The suggestion kept for this wardrobe, if it is recent enough. */
export function readGapCache<T>(userId: string, sig: string, now = Date.now()): T | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as Saved<T> | null;
    if (!saved || saved.sig !== sig || !(now - saved.at < GAP_CACHE_MS) || now < saved.at) return null;
    return saved.suggestion;
  } catch {
    return null;
  }
}

export function writeGapCache<T>(userId: string, sig: string, suggestion: T, now = Date.now()): void {
  try { localStorage.setItem(key(userId), JSON.stringify({ sig, at: now, suggestion } satisfies Saved<T>)); } catch { /* asked again next time */ }
}
