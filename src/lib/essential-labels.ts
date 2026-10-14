// Packing-list entries the trip planner writes itself (trip-capsule.server.ts) are stored under
// fixed English names — "Underwear", "Bras", "Socks", "Sleepwear" in the "Underwear" category — so
// re-running the planner can recognise them and never add them twice. They are shown in the
// person's language here; anything the person typed is shown exactly as written.
import type { TFunction } from "i18next";

const NAME_KEYS: Record<string, string> = {
  Underwear: "tripDetail.underwearItem",
  Bras: "tripDetail.bras",
  Socks: "tripDetail.socks",
  Sleepwear: "tripDetail.sleepwear",
};

const CATEGORY_KEYS: Record<string, string> = {
  Underwear: "tripDetail.underwear",
  Other: "tripDetail.otherCategory",
};

export function essentialNameLabel(t: TFunction, name: string): string {
  const key = NAME_KEYS[name];
  return key ? t(key, { defaultValue: name }) : name;
}

export function essentialCategoryLabel(t: TFunction, category: string): string {
  const key = CATEGORY_KEYS[category];
  return key ? t(key, { defaultValue: category }) : category;
}
