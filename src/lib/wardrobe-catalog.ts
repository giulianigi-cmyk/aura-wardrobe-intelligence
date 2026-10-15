// The wardrobe sent to the stylist model. Every piece is available: the engines used to cut the
// catalog at 200 pieces (320 in the chat), so in a 500-piece wardrobe most suits and coats were never
// even seen by the model (reported: "non fa mai vedere tanti completi che ho"). CATALOG_MAX_ITEMS is
// only a safety ceiling for extreme wardrobes, far above a real one.
export const CATALOG_MAX_ITEMS = 1500;

/** The catalog as JSON with empty fields left out: they only cost tokens, and dropping them is what
 *  keeps a whole wardrobe affordable. "lastWornDaysAgo" stays even when null (never worn). */
export function compactCatalogJson(catalog: Record<string, unknown>[]): string {
  return JSON.stringify(catalog.map((c) =>
    Object.fromEntries(Object.entries(c).filter(([k, v]) =>
      k === "lastWornDaysAgo" || (v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))))));
}
