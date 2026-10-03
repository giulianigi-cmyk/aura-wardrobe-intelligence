// How a piece is WORN differently from the closest one already owned: heel height, day or evening,
// how dressed-up it is, and the occasions it adds. The purchase advisor used to show only the
// construction details it adds ("ha in più: slingback, vernice"), which said little — what matters
// is that high crystal sandals go to different occasions than the flat sandals in the wardrobe.

const HEEL_RANK: Record<string, number> = { Flat: 0, Low: 1, Mid: 2, High: 3 };

export type WearSide = {
  heelHeight: string | null;
  dayEvening: string | null;
  formality: number | null;
  occasions: string[];
};

export type WearDifference = {
  /** "higherHeel" | "lowerHeel" | "moreEvening" | "moreDaytime" | "moreFormal" | "moreCasual" */
  changes: string[];
  /** Occasions the product suits that the owned piece doesn't (at most 3). */
  newOccasions: string[];
};

/** Owned pieces store occasions as "Work, Evening". */
export function occasionList(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean);
}

export function wearDifference(product: WearSide, owned: WearSide): WearDifference | null {
  const changes: string[] = [];
  const ph = product.heelHeight ? HEEL_RANK[product.heelHeight] : undefined;
  const oh = owned.heelHeight ? HEEL_RANK[owned.heelHeight] : undefined;
  if (ph != null && oh != null && ph !== oh) changes.push(ph > oh ? "higherHeel" : "lowerHeel");
  const pe = product.dayEvening, oe = owned.dayEvening;
  if (pe && oe && pe !== oe) {
    if (pe === "evening" || (pe === "both" && oe === "day")) changes.push("moreEvening");
    else if (pe === "day" || (pe === "both" && oe === "evening")) changes.push("moreDaytime");
  }
  if (product.formality != null && owned.formality != null && Math.abs(product.formality - owned.formality) >= 2) {
    changes.push(product.formality > owned.formality ? "moreFormal" : "moreCasual");
  }
  const mine = new Set(owned.occasions);
  const newOccasions = owned.occasions.length ? product.occasions.filter((o) => !mine.has(o)).slice(0, 3) : [];
  return changes.length || newOccasions.length ? { changes, newOccasions } : null;
}
