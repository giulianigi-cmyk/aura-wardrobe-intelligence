// Which kinds of piece AURA itself proposes (gap analysis, first steps, suggested types) for the
// gender on the profile. Never used to hide or refuse a piece the person adds or owns: it only keeps
// AURA from asking a man for skirts, dresses or handbags. No gender set: everything stays available.

const WOMENSWEAR_CATEGORIES = new Set(["Dresses"]);
const WOMENSWEAR_TYPES = new Set([
  "Skirt", "Blouse", "Camisole", "Crop Top", "Bodysuit", "Leggings",
  "Pumps", "Mules", "Wedges", "Flats",
  "Clutch", "Hobo Bag", "Bucket Bag", "Top Handle Bag", "Shoulder Bag",
  "Earrings", "Hair Accessory", "Brooch", "Anklet",
  "Bra", "Sports Bra", "Panties", "Shapewear", "Tights",
  "One-piece Swimsuit", "Bikini Top", "Bikini Bottom", "Tennis Skirt",
]);
const MENSWEAR_TYPES = new Set(["Boxers"]);

/** Whether AURA may propose this kind of piece to a person of this gender. */
export function suggestableForGender(gender: string | null | undefined, category: string, subcategory?: string | null): boolean {
  if (gender === "Man") return !WOMENSWEAR_CATEGORIES.has(category) && !WOMENSWEAR_TYPES.has(subcategory ?? "");
  if (gender === "Woman") return !MENSWEAR_TYPES.has(subcategory ?? "");
  return true;
}

/** The type lists narrowed to what may be proposed for this gender (categories left empty are dropped). */
export function suggestableTypes(gender: string | null | undefined, options: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [cat, subs] of Object.entries(options)) {
    const kept = subs.filter((s) => suggestableForGender(gender, cat, s));
    if (kept.length && suggestableForGender(gender, cat, null)) out[cat] = kept;
  }
  return out;
}
