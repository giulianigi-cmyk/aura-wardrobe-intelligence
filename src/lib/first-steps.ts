// "Primi passi" on Home for a new wardrobe: the pieces to photograph first, so the first looks come
// quickly. Shown until FIRST_STEPS_TARGET pieces are in the wardrobe.

export const FIRST_STEPS_TARGET = 10;
/** Pieces needed for the first look of the day (Home asks for at least 3). */
export const FIRST_LOOK_MIN = 3;

export type StarterGroup = {
  key: "tops" | "bottoms" | "outerwear" | "shoes" | "bags";
  want: number;
  have: number;
  /** i18n key under firstSteps.group: the men's wording asks for no skirts, dresses or handbags. */
  label: string;
};

const GROUP_OF: Record<string, StarterGroup["key"] | undefined> = {
  Tops: "tops", Activewear: "tops",
  Bottoms: "bottoms", Dresses: "bottoms", Jumpsuits: "bottoms",
  Outerwear: "outerwear",
  Shoes: "shoes",
  Bags: "bags",
};

const WANT: Record<StarterGroup["key"], number> = { tops: 3, bottoms: 2, outerwear: 1, shoes: 2, bags: 1 };

/** What is already there of the starter set, group by group (a dress counts as a bottom: it makes a
 *  look with shoes on its own). */
const MAN_LABEL: Partial<Record<StarterGroup["key"], string>> = { tops: "topsMan", bottoms: "bottomsMan", bags: "accessoriesMan" };

/** `gender` from the profile: for "Man" the last slot is any accessory (belt, watch, backpack…), not
 *  a handbag, and the wording mentions no skirts or dresses. No gender set: the general list. */
export function starterProgress(
  items: { category: string | null }[],
  gender?: string | null,
): { total: number; groups: StarterGroup[] } {
  const man = gender === "Man";
  const have: Record<StarterGroup["key"], number> = { tops: 0, bottoms: 0, outerwear: 0, shoes: 0, bags: 0 };
  for (const it of items) {
    const g = man && it.category === "Accessories" ? "bags" : GROUP_OF[it.category ?? ""];
    if (g) have[g]++;
  }
  return {
    total: items.length,
    groups: (Object.keys(WANT) as StarterGroup["key"][]).map((key) => ({
      key, want: WANT[key], have: have[key], label: (man && MAN_LABEL[key]) || key,
    })),
  };
}
