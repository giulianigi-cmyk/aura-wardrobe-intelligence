// Pairing heuristic of the purchase advisor ("si abbina a N tuoi capi"): pure, so the wish list can
// show it for each wished piece without another analysis.
import { COLOR_PALETTE } from "./color-palette";
import type { WardrobeItem } from "./aura-types";

const NEUTRAL_FAMILIES = new Set(["Whites", "Blacks & Greys", "Beiges"]);
const colorFamily = (name: string): string | undefined => COLOR_PALETTE.find((c) => c.name === name)?.family;
const isNeutralColor = (name: string): boolean => {
  const f = colorFamily(name);
  return f ? NEUTRAL_FAMILIES.has(f) : false;
};
const PAIRING_WHITELIST: Record<string, string[]> = {
  Tops: ["Bottoms", "Outerwear", "Shoes", "Bags", "Accessories"],
  Bottoms: ["Tops", "Outerwear", "Shoes", "Bags", "Accessories"],
  Dresses: ["Outerwear", "Shoes", "Bags", "Accessories"],
  Jumpsuits: ["Outerwear", "Shoes", "Bags", "Accessories"],
  Outerwear: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Shoes", "Bags"],
  Shoes: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear", "Bags"],
  Bags: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear", "Shoes"],
  Accessories: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear"],
};

export function countPairings(category: string, colors: string[], wardrobe: WardrobeItem[]): number {
  const whitelist = new Set(PAIRING_WHITELIST[category] ?? []);
  if (whitelist.size === 0) return 0;
  const productIsNeutral = colors.length === 0 || colors.every(isNeutralColor);
  let count = 0;
  for (const it of wardrobe) {
    if (!it.category || !whitelist.has(it.category)) continue;
    const itColors = it.colors ?? [];
    const exactMatch = itColors.some((c) => colors.includes(c));
    const eitherNeutral = productIsNeutral || itColors.some(isNeutralColor);
    if (exactMatch || eitherNeutral) count++;
  }
  return count;
}
