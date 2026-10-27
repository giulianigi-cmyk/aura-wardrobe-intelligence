// Knee and over-the-knee boots are worn with skirts, dresses and shorts, or with trousers narrow
// enough to tuck inside the shaft (skinny, slim, tapered, leggings). Straight, bootcut, flared or
// wide trousers either bunch up inside the boot or hide it entirely: the pairing never works, and
// it showed up as a real "today" look (straight ecru tailored trousers with black knee boots).
// One rule, used by every engine that composes an outfit.

export type LegCheckable = {
  category?: string | null;
  subcategory?: string | null;
  fit?: string | null;
  legShape?: string | null;
  styleTags?: string[] | null;
};

export const LEG_SHAPES_INSIDE_BOOTS = ["skinny", "slim", "tapered"];

const TALL_BOOT = /knee|ginocchio|cuissard|mosquet|thigh.?high|tall boot|stival[ei] alt/i;
const NO_LEGS = /skirt|gonna|falda|jupe|short|bermuda|skort/i;
const NARROW_TEXT = /skinny|slim|legging|jegging|sigaretta|cigarette|tapered|carrot/i;

export function isTallBoot(it: LegCheckable): boolean {
  return it.category === "Shoes" && TALL_BOOT.test(it.subcategory ?? "");
}

/** Trousers (or a jumpsuit) whose leg cannot go inside a tall boot. Skirts and shorts never clash;
 *  the leg shape decides when it is known, otherwise the fit and the type (leggings, "Slim"). */
export function clashesWithTallBoots(it: LegCheckable): boolean {
  if (it.category !== "Bottoms" && it.category !== "Jumpsuits") return false;
  const sub = it.subcategory ?? "";
  if (NO_LEGS.test(sub)) return false;
  const shape = (it.legShape ?? "").toLowerCase();
  if (shape) return !LEG_SHAPES_INSIDE_BOOTS.includes(shape);
  // A jumpsuit with no leg shape may well be a short playsuit: only a known shape decides.
  if (it.category === "Jumpsuits") return false;
  if (/slim|skinny/i.test(it.fit ?? "")) return false;
  return !NARROW_TEXT.test(`${sub} ${(it.styleTags ?? []).join(" ")}`);
}

/** True when the look pairs tall boots with trousers that can't go inside them. */
export function violatesTallBootsRule(items: readonly LegCheckable[]): boolean {
  return items.some(isTallBoot) && items.some(clashesWithTallBoots);
}

export const TALL_BOOTS_PROMPT_RULE =
  "TALL BOOTS RULE — HARD EXCLUSION: knee-high or over-the-knee boots (subcategory Knee Boots / Over-the-Knee Boots) go ONLY with skirts, dresses, shorts, or trousers narrow enough to tuck inside the shaft (legShape skinny, slim or tapered, leggings, or fit Slim). " +
  "Never pair them with straight, bootcut, flared or wide-leg trousers, or with trousers whose legShape is unknown and whose fit is Regular, Relaxed, Oversized or Tailored — choose ankle boots or other shoes for those trousers instead.";
