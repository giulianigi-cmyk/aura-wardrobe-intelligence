/** Pure outfit-layout maths (no DOM, no imports) — shared by
 *  compose-outfit-canvas.ts (Home) and, later, OutfitBuilder.tsx so the
 *  two can never drift apart again.
 *
 *  Model: a flat-lay on a 4:5 canvas. Every item is sized by BOTH a max
 *  width and a max height (fractions of the canvas), using its REAL
 *  aspect ratio (h / w of the visible garment). The anchor (dress /
 *  bottom) is dimensioned by height; the top sits diagonally up-right,
 *  overlapping the waist by ~45% of its own height; shoes go in the
 *  free bottom-right corner; the bag takes the free side; small
 *  accessories fill the corners. Never any rotation.
 *
 *  All numbers below were measured on the editorial reference boards
 *  (cell ratio 4:5, grid 0-1, ±0.03).
 */

export type Bucket =
  | "dress" | "bottom" | "top" | "outer" | "shoes" | "bag" | "belt" | "acc"
  // body-anchored accessories: each one is placed where it is worn (see layoutOutfit)
  | "sunglasses" | "headwear" | "earrings" | "necklace" | "brooch" | "wrist" | "anklet";

export const CANVAS_W = 1080;
export const CANVAS_H = 1350; // 4:5

export type LayoutInput = {
  id: string; bucket: Bucket;
  /** height / width of the visible garment */
  aspect: number;
  /** wardrobe subcategory ("Skirt", "Shirt", "Sneakers", …) and length ("Mini" | "Midi" | "Maxi" | "Short" | "Long" …):
   *  used to size each piece by its REAL-WORLD dimension (see realCm) */
  subcategory?: string | null;
  length?: string | null;
  /** share of the visible bounding box that is actually opaque (0-1). A bag photographed with a long
   *  thin strap has a big, mostly empty box: without this its body came out tiny. */
  fill?: number | null;
};
export type LayoutRect = { id: string; bucket: Bucket; /** top-left, canvas px */ x: number; y: number; w: number; h: number; z: number };

const MARGIN = 0.04; // min distance from canvas edge (fraction)
/** Bottom strip kept EMPTY for the "aura" watermark (drawn bottom-centre by
 *  compose-outfit-canvas.ts, its glyphs span y ≈ .97-.99). No garment or
 *  accessory may enter it: everything is clamped to y ≤ 1 − BOTTOM_RESERVED. */
export const BOTTOM_RESERVED = 0.055;
const GROUP_SHRINK = 0.75; // when several items share one slot

/** Max box per bucket: [max width, max height], fractions of canvas W / H. */
const BOX: Record<Bucket, { w: number; h: number }> = {
  dress: { w: 0.46, h: 0.80 },
  bottom: { w: 0.42, h: 0.69 },
  top: { w: 0.42, h: 0.37 },
  outer: { w: 0.42, h: 0.72 },
  shoes: { w: 0.36, h: 0.20 },
  bag: { w: 0.40, h: 0.34 },
  sunglasses: { w: 0.28, h: 0.10 },
  headwear: { w: 0.22, h: 0.12 },
  earrings: { w: 0.12, h: 0.12 },
  necklace: { w: 0.20, h: 0.12 },
  brooch: { w: 0.07, h: 0.07 },
  wrist: { w: 0.10, h: 0.15 }, // watch, bracelet, ring, gloves
  anklet: { w: 0.14, h: 0.06 },
  belt: { w: 0.20, h: 0.09 },
  acc: { w: 0.22, h: 0.16 },
};
const TOP_AS_ANCHOR = { w: 0.50, h: 0.45 };

const Z: Record<Bucket, number> = { outer: 1, dress: 2, bottom: 2, belt: 5, top: 4, shoes: 5, bag: 5, sunglasses: 5, headwear: 5, earrings: 5, necklace: 5, brooch: 6, wrist: 5, anklet: 5, acc: 5 };

/** Real-world size, in cm, of the dimension that matters for each kind of piece:
 *  garments → their length (height), bags → width, shoes → length. Unknown → null
 *  (the plain bucket box is used). This is what keeps a mini skirt short, a maxi
 *  skirt long, a shirt bigger than a tank top, a tote bigger than a clutch. */
export function realCm(bucket: Bucket, subcategory?: string | null, length?: string | null): number | null {
  const sub = (subcategory ?? "").toLowerCase();
  const len = (length ?? "").toLowerCase();
  const has = (...words: string[]) => words.some((w) => sub.includes(w));
  switch (bucket) {
    case "top":
      if (len === "cropped" || has("crop")) return 42;
      if (len === "longline" || has("tunic")) return 80;
      if (has("tank", "camisole", "vest top")) return 55;
      if (has("bodysuit")) return 58;
      if (has("shirt") && !has("t-shirt", "tshirt", "sweatshirt")) return 70;
      if (has("blouse")) return 64;
      if (has("hoodie", "sweatshirt")) return 66;
      if (has("sweater", "cardigan", "knit")) return 64;
      return 62; // T-shirt, polo, generic
    case "bottom":
      if (has("skirt")) return len === "mini" ? 40 : len === "midi" ? 75 : len === "maxi" ? 100 : 80;
      if (has("bermuda")) return 52;
      if (has("shorts")) return 42;
      return 100; // trousers, jeans, leggings, cargo, joggers
    case "dress":
      if (has("playsuit", "romper")) return 80;
      if (has("jumpsuit")) return 150;
      return len === "mini" ? 90 : len === "midi" ? 115 : len === "maxi" ? 140 : 120;
    case "outer":
      if (len === "short") return 60;
      if (len === "mid") return 85;
      if (len === "long") return 110;
      if (has("blazer")) return 75;
      if (has("coat", "trench")) return 110;
      if (has("parka")) return 100;
      if (has("puffer")) return 90;
      if (has("cape")) return 80;
      if (has("shacket", "rain jacket")) return 70;
      if (has("windbreaker")) return 65;
      if (has("jacket", "vest")) return 60;
      return 90;
    case "bag":
      if (has("tote")) return 40;
      if (has("hobo")) return 32;
      if (has("shoulder", "satchel", "backpack")) return 30;
      if (has("top handle")) return 28;
      if (has("bucket")) return 26;
      if (has("crossbody")) return 24;
      if (has("clutch")) return 25;
      if (has("belt bag")) return 22;
      return 30;
    case "shoes":
      if (has("over-the-knee")) return 34;
      if (has("knee boots")) return 32;
      if (has("boots")) return 29;
      if (has("sneakers", "running", "loafers")) return 28;
      if (has("flats", "pumps", "mules")) return 25;
      return 27;
    default:
      return null;
  }
}

/** How much a piece is scaled versus its bucket's reference box: cm / reference cm,
 *  clamped so nothing leaves the composition (reference = long trousers, a T-shirt,
 *  a maxi-ish dress, a 100 cm coat, a 30 cm bag, a 28 cm shoe — the pieces the
 *  editorial boards were measured on). */
const REFERENCE: Partial<Record<Bucket, { cm: number; min: number; max: number }>> = {
  bottom: { cm: 100, min: 0.38, max: 1 },
  dress: { cm: 130, min: 0.6, max: 1 },
  top: { cm: 62, min: 0.72, max: 1.2 },
  outer: { cm: 100, min: 0.55, max: 1.1 },
  bag: { cm: 30, min: 0.8, max: 1.2 },
  shoes: { cm: 28, min: 0.85, max: 1.1 },
};
function realScale(it: LayoutInput): number {
  const ref = REFERENCE[it.bucket];
  const cm = realCm(it.bucket, it.subcategory, it.length);
  if (!ref || cm == null) return 1;
  // Bags: a clutch is smaller than a tote, but only SOFTLY so (a real 24 cm crossbody is not
  // 20% smaller than a 30 cm shoulder bag on a flat-lay board) — they used to come out too small.
  const ratio = it.bucket === "bag" ? Math.pow(cm / ref.cm, 0.4) : cm / ref.cm;
return Math.min(ref.max, Math.max(ref.min, ratio));

}

export function bucketOf(category: string | null, subcategory?: string | null): Bucket {
  const sub = (subcategory ?? "").toLowerCase();
  if (category === "Dresses" || category === "Jumpsuits") return "dress";
  if (category === "Bottoms") return "bottom";
  if (category === "Tops") return "top";
  if (category === "Outerwear") return "outer";
  if (category === "Shoes") return "shoes";
  if (category === "Bags") return "bag";
  if (category === "Accessories") {
    if (sub === "sunglasses") return "sunglasses";
    if (sub === "belt") return "belt";
    if (sub === "earrings") return "earrings";
    if (sub === "necklace") return "necklace";
    if (sub === "brooch") return "brooch";
    if (sub === "anklet") return "anklet";
    if (["watch", "bracelet", "ring", "gloves"].includes(sub)) return "wrist";
    if (["hat", "cap", "hair accessory"].includes(sub)) return "headwear";
  }
  return "acc";
}

type Box = { w: number; h: number };

/** Spacing factor for pieces fanned out inside one slot: tiny accessories keep a hair of air
 *  between them, bigger pieces (two pairs of shoes, two tops) may touch slightly. */
const spanKOf = (bucket: Bucket): number => (bucket === "wrist" || bucket === "earrings" ? 1.06 : 0.95);

export function layoutOutfit(items: LayoutInput[], W = CANVAS_W, H = CANVAS_H): LayoutRect[] {
  if (!items.length) return [];
  const MX = MARGIN * W;
  const MY = MARGIN * H;
  const MB = BOTTOM_RESERVED * H; // bottom limit, see BOTTOM_RESERVED
  const by = new Map<Bucket, LayoutInput[]>();
  for (const it of items) by.set(it.bucket, [...(by.get(it.bucket) ?? []), it]);
  const has = (b: Bucket) => (by.get(b)?.length ?? 0) > 0;

  const out: LayoutRect[] = [];
  const clampC = (c: number, size: number, lo: number, hi: number) => Math.min(Math.max(c, lo + size / 2), hi - size / 2);

  /** Size = fit inside the bucket box using the real aspect ratio. */
  const sizeOf = (it: LayoutInput, box: Box, shrink: number) => {
    const aspect = it.aspect > 0 ? it.aspect : 1;
    // A bag or shoe whose box is mostly empty (thin strap, chain, long handles, a strappy stiletto
    // sandal) is enlarged so that its BODY reaches the size a compact one would (up to +35%).
    const strapK = (it.bucket === "bag" || it.bucket === "shoes") && it.fill != null && it.fill > 0 && it.fill < 0.6
      ? Math.min(1.35, Math.sqrt(0.6 / Math.max(it.fill, 0.25)))
      : 1;
    const f = realScale(it) * strapK;
    // Garments: the real LENGTH sets the height cap (a mini skirt is short, a maxi long);
    // the width cap stays put so wide pieces can't overflow. Bags and shoes: the real
    // WIDTH is what matters, so both caps follow it.
    const byLength = it.bucket === "top" || it.bucket === "bottom" || it.bucket === "dress" || it.bucket === "outer";
    const visualK = it.bucket === "bag" ? 0.90 : 1;

const w = Math.min(
  box.w * W * shrink * (byLength ? 1 : f),
  (box.h * H * shrink * f) / aspect
) * visualK;

return { w, h: w * aspect };
  };

  /** Places all items of one slot around (cx, cy), fanned along `axis`,
   *  each clamped inside the canvas margins. cy may depend on the tallest item. */
  const placeGroup = (
    list: LayoutInput[], bucket: Bucket, box: Box,
    cx: number, cy: number | ((maxH: number) => number),
    axis: "x" | "y" = "x", z: number = Z[bucket],
  ): LayoutRect[] => {
    const shrink = list.length > 1 ? GROUP_SHRINK : 1;
    const sizes = list.map((it) => sizeOf(it, box, shrink));
    const maxH = Math.max(...sizes.map((s) => s.h));
    const cyv = typeof cy === "function" ? cy(maxH) : cy;
    const rects: LayoutRect[] = [];
    // small pieces sharing a slot (watch + bracelet, a pair of earrings…) sit side by side without touching
    const spanK = spanKOf(bucket);
    const spans = sizes.map((sz) => (axis === "x" ? sz.w : sz.h) * spanK);
    const total = spans.reduce((a, v) => a + v, 0);
    // move the group as a unit so it fits inside the margins (clamping item by item would squash neighbours together)
    const cxg = axis === "x" ? Math.min(W - MX - total / 2, Math.max(MX + total / 2, cx)) : cx;
    const cyg = axis === "y" ? Math.min(H - MB - total / 2, Math.max(MY + total / 2, cyv)) : cyv;
    let cursor = -total / 2;
    list.forEach((it, i) => {
      const s = sizes[i];
      const off = cursor + spans[i] / 2;
      cursor += spans[i];
      const px = clampC(axis === "x" ? cxg + off : cxg, s.w, MX, W - MX);
      const py = clampC(axis === "y" ? cyg + off : cyg, s.h, MY, H - MB);
      rects.push({ id: it.id, bucket, x: px - s.w / 2, y: py - s.h / 2, w: s.w, h: s.h, z });
    });
    out.push(...rects);
    return rects;
  };
  const union = (rs: LayoutRect[]) => ({
    l: Math.min(...rs.map((r) => r.x)), r: Math.max(...rs.map((r) => r.x + r.w)),
    t: Math.min(...rs.map((r) => r.y)), b: Math.max(...rs.map((r) => r.y + r.h)),
  });

  const anchorBucket: Bucket | null = has("dress") ? "dress" : has("bottom") ? "bottom" : has("top") ? "top" : null;

  // No garment at all (only accessories): simple 2-column grid.
  if (!anchorBucket) {
    const cols = 2, rows = Math.ceil(items.length / cols);
    const cw = (W - 2 * MX) / cols, ch = (H - MY - MB) / Math.max(rows, 1);
    items.forEach((it, i) => {
      const s = sizeOf(it, { w: (cw * 0.85) / W, h: (ch * 0.85) / H }, 1);
      const c = i % cols, r = Math.floor(i / cols);
      out.push({ id: it.id, bucket: it.bucket, x: MX + c * cw + (cw - s.w) / 2, y: MY + r * ch + (ch - s.h) / 2, w: s.w, h: s.h, z: 5 });
    });
    return out;
  }

  const outer = has("outer");
  const anchorList = by.get(anchorBucket)!;
  const anchorCx = (anchorBucket === "dress" ? (outer ? 0.52 : 0.46) : anchorBucket === "bottom" ? (outer ? 0.52 : 0.44) : 0.5) * W;
  const tops = anchorBucket === "top" ? [] : by.get("top") ?? [];

  // Top height decides how far down the anchor starts (top must stay inside the margin).
  const topSizes = tops.map((t) => sizeOf(t, BOX.top, tops.length > 1 ? GROUP_SHRINK : 1));
  const topH = topSizes.length ? Math.max(...topSizes.map((s) => s.h)) : 0;

  // ── Anchor ──
  let anchorRects: LayoutRect[];
  if (anchorBucket === "bottom" && tops.length) {
    anchorRects = placeGroup(anchorList, "bottom", BOX.bottom, anchorCx, (h) => Math.max(0.25 * H, MY + 0.55 * topH) + h / 2);
  } else if (anchorBucket === "top") {
    anchorRects = placeGroup(anchorList, "top", TOP_AS_ANCHOR, anchorCx, 0.42 * H, "x", Z.dress);
  } else {
    anchorRects = placeGroup(anchorList, anchorBucket, BOX[anchorBucket], anchorCx, 0.52 * H);
  }
  const A = union(anchorRects);
  const aW = A.r - A.l, aH = A.b - A.t;

  // ── Outer: big, left, behind the anchor ──
  if (outer) placeGroup(by.get("outer")!, "outer", BOX.outer, 0.22 * W, 0.50 * H);

  // ── Top: diagonal up-right, waist overlap ≈ 45% of its own height ──
  let topRects: LayoutRect[] = [];
  if (tops.length) {
    if (anchorBucket === "bottom") {
      topRects = placeGroup(tops, "top", BOX.top, anchorCx + 0.26 * W, () => A.t - 0.05 * topH);
    } else {
      topRects = placeGroup(tops, "top", BOX.top, 0.72 * W, () => MY + topH / 2 + 0.02 * H);
    }
  }

  // Torso = where the garment covering the chest sits. Every body-anchored
  // accessory below is positioned relative to it, the way it is worn:
  // head-level things and the necklace beside the neckline, wrist
  // things at hip height beside the legs (where the hands hang).
  const torso = topRects.length
    ? union(topRects)
    : anchorBucket === "dress"
      ? { l: A.l, r: A.r, t: A.t, b: A.t + 0.5 * aH }
      : anchorBucket === "top"
        ? A
        : { l: A.l, r: A.r, t: MY, b: A.t }; // bottom only: virtual torso above the waist
  const torsoW = torso.r - torso.l, torsoH = torso.b - torso.t;
  const wristTop =
    anchorBucket === "dress" ? A.t + 0.42 * aH
    : anchorBucket === "bottom" ? (topRects.length ? torso.b + 0.03 * H : A.t + 0.10 * H)
    : A.b - 0.15 * H;

  // ── Belt: beside the garment (left of the trousers / dress at waist height), never
  //    laid on top of it; with a coat on the left, in the bottom-left corner ──
  const beltList = by.get("belt") ?? [];
  const beltBeside = beltList.length > 0 && anchorBucket !== "top";
  let beltRects: LayoutRect[] = [];
  if (beltBeside) {
    const bw = BOX.belt.w * W;
    if (outer) {
      beltRects = placeGroup(beltList, "belt", BOX.belt, 0.17 * W, 0.81 * H, "y");
    } else {
      const beltY = anchorBucket === "bottom" ? A.t + 0.11 * H : A.t + 0.38 * aH;
      beltRects = placeGroup(beltList, "belt", BOX.belt, Math.max(MX + bw / 2, A.l - bw / 2 - 0.02 * W), beltY, "y");
    }
  }

  // Necklace: never laid ON the garment. Beside the torso at neckline height on the
  // free side (right first); if there is no room there (top up-right of the trousers),
  // in the top band on the left; with a coat on the left, in the bottom-left corner.
  let necklaceSide: "right" | "left" | "corner" | null = null;
  if (has("necklace")) {
    const rightFree = W - MX - (torso.r + 0.02 * W);
    necklaceSide = rightFree >= 0.16 * W ? "right" : outer ? "corner" : "left";
  }
  // A hat / hair accessory normally takes the top-left slot; it moves to the wrist
  // cluster when that slot (or the coat's side) is already taken.
  const hatWithWrist = outer || necklaceSide === "left";
  const wristList = [...(by.get("wrist") ?? []), ...(hatWithWrist ? by.get("headwear") ?? [] : [])];

  // ── Right column, when a coat takes the left ──
  // Necklace (on a dress), watch/bracelet, bag and shoes all live in the free right-hand
  // strip. Placed independently they land on top of each other (watch on the bag, bag on
  // the boots), so they are STACKED top → bottom instead: necklace at the neckline, shoes
  // at the bottom, what is in between spread out, everything scaled down together if the
  // strip is too short — and never wider than the strip allows.
  const shoeBox = outer ? { w: 0.32, h: 0.18 } : BOX.shoes; // narrower when the coat takes the left side
  const columnEntries: { list: LayoutInput[]; bucket: Bucket; box: Box; axis: "x" | "y" }[] = [];
  if (outer) {
    if (necklaceSide === "right") {
      columnEntries.push({ list: by.get("necklace")!, bucket: "necklace", box: { w: Math.min(0.20, (W - MX - (torso.r + 0.02 * W)) / W), h: 0.12 }, axis: "x" });
    }
    if (wristList.length) columnEntries.push({ list: wristList, bucket: "wrist", box: BOX.wrist, axis: "x" });
    if (has("bag")) columnEntries.push({ list: by.get("bag")!, bucket: "bag", box: BOX.bag, axis: "y" });
    if (has("shoes")) columnEntries.push({ list: by.get("shoes")!, bucket: "shoes", box: shoeBox, axis: by.get("shoes")!.length > 1 ? "y" : "x" });
  }
  const useColumn = columnEntries.length >= 2;
  let shoeRects: LayoutRect[] = [];
  if (useColumn) {
    const n = columnEntries.length;
    const scaled = (b: Box, k: number): Box => ({ w: b.w * k, h: b.h * k });
    const shrinkOf = (l: LayoutInput[]) => (l.length > 1 ? GROUP_SHRINK : 1);
    const groupSize = (e: (typeof columnEntries)[number], k: number) => {
      const sz = e.list.map((it) => sizeOf(it, scaled(e.box, k), shrinkOf(e.list)));
      const sk = spanKOf(e.bucket);
      return e.axis === "y"
        ? { w: Math.max(...sz.map((q) => q.w)), h: sz.reduce((a, q) => a + q.h * sk, 0) }
        : { w: sz.reduce((a, q) => a + q.w * sk, 0), h: Math.max(...sz.map((q) => q.h)) };
    };
    // 1) fit the strip's width (≤ ~25% overlap with the anchor)
    const stripW = Math.max(0.16 * W, (W - MX - A.r) / 0.75);
    let ks = columnEntries.map((e) => Math.min(1, stripW / groupSize(e, 1).w));
    // 2) fit its height
    const colTop = topRects.length ? Math.max(...topRects.map((r) => r.y + r.h)) + 0.02 * H : necklaceSide === "right" ? torso.t : wristTop;
    const colBottom = 0.92 * H;
    const gapMin = 0.02 * H;
    let hs = columnEntries.map((e, i) => groupSize(e, ks[i]).h);
    const sum = () => hs.reduce((a, h) => a + h, 0);
    if (sum() + gapMin * (n - 1) > colBottom - colTop) {
      const k = Math.max(0.6, (colBottom - colTop - gapMin * (n - 1)) / sum());
      ks = ks.map((x) => x * k);
      hs = columnEntries.map((e, i) => groupSize(e, ks[i]).h);
    }
    // 3) top-aligned with even gaps, last entry (shoes) sitting on the bottom line
    const gap = Math.min(Math.max(gapMin, (colBottom - colTop - sum()) / (n - 1)), 0.10 * H);
    let cursor = colTop;
    columnEntries.forEach((e, i) => {
      const isLast = i === n - 1;
      const top = isLast ? Math.max(cursor, colBottom - hs[i]) : cursor;
      const gw = groupSize(e, ks[i]).w;
      const rects = placeGroup(e.list, e.bucket, scaled(e.box, ks[i]), W - MX - gw / 2, top + hs[i] / 2, e.axis);
      if (e.bucket === "shoes") shoeRects = rects;
      cursor = top + hs[i] + gap;
    });
  }

  // ── Shoes: free bottom-right corner, ≤ ~20% overlap with the anchor ──
  if (has("shoes") && !useColumn) {
    const shoeShrink = by.get("shoes")!.length > 1 ? GROUP_SHRINK : 1;
    const ws = Math.max(...by.get("shoes")!.map((it) => sizeOf(it, shoeBox, shoeShrink).w));
    const cx = Math.min(W - MX - ws / 2, A.r + ws / 2 - 0.2 * ws);
    // Several pairs: stack them in the corner instead of fanning sideways (a sideways
    // fan would push the first pair back under the anchor).
    shoeRects = placeGroup(by.get("shoes")!, "shoes", shoeBox, Math.max(cx, 0.75 * W), (outer ? 0.86 : 0.80) * H, by.get("shoes")!.length > 1 ? "y" : "x");
  }

  // ── Bag: free side, slightly tucked against the anchor ──
  if (has("bag") && !useColumn) {
    const bagShrink = by.get("bag")!.length > 1 ? GROUP_SHRINK : 1;
    const bw = Math.max(...by.get("bag")!.map((it) => sizeOf(it, BOX.bag, bagShrink).w));
    if (outer) {
      placeGroup(by.get("bag")!, "bag", BOX.bag, W - MX - bw / 2, 0.67 * H, "y");
    } else {
      // The bag sits beside the anchor, tucked ~40% of its own width under the garment's edge (the
      // editorial boards do the same). It only shrinks a little (never below 85%) when the strip on
      // the left is narrow — it used to be squeezed down and came out too small.
      const kFit = Math.max(0.85, Math.min(1, (A.l - MX) / (0.6 * bw)));
      const bwk = bw * kFit;
      const bagBoxK = { w: BOX.bag.w * kFit, h: BOX.bag.h * kFit };
      // Vertically: at its usual height, but never on top of the belt drawn beside the garment.
      const bagH = Math.max(...by.get("bag")!.map((it) => sizeOf(it, bagBoxK, bagShrink).h));
      const belowBelt = beltRects.length ? union(beltRects).b + 0.03 * H + bagH / 2 : 0;
      placeGroup(by.get("bag")!, "bag", bagBoxK, Math.max(MX + bwk / 2, A.l - 0.1 * bwk), Math.max(0.58 * H, belowBelt), "y");
    }
  }

  // ── Head-level: sunglasses, earrings, headwear — the top band, beside the neckline ──
  if (has("sunglasses")) {
    // beside the torso, stacked under the earrings; with a coat on the left, up in the top band
    if (outer) placeGroup(by.get("sunglasses")!, "sunglasses", BOX.sunglasses, 0.22 * W, (mh) => MY + mh / 2);
    else {
      const gw = 0.22 * W;
      placeGroup(by.get("sunglasses")!, "sunglasses", { w: 0.22, h: 0.09 }, Math.max(MX + gw / 2, A.l - 0.45 * gw), 0.22 * H);
    }
  }
  if (has("earrings")) {
    const ew = BOX.earrings.w * W;
    placeGroup(by.get("earrings")!, "earrings", BOX.earrings, torso.l - ew / 2 - 0.02 * W, (mh) => MY + mh / 2 + 0.01 * H);
  }
  if (has("headwear") && !hatWithWrist) {
    placeGroup(by.get("headwear")!, "headwear", BOX.headwear, 0.22 * W, (mh) => MY + mh / 2 + 0.01 * H);
  }

  // ── Necklace (beside the torso, see above) and brooch (on the chest) ──
  if (has("necklace") && !(useColumn && necklaceSide === "right")) {
    if (necklaceSide === "right") {
      const bw = Math.min(0.20, (W - MX - (torso.r + 0.02 * W)) / W);
      placeGroup(by.get("necklace")!, "necklace", { w: bw, h: 0.12 }, torso.r + 0.02 * W + (bw * W) / 2, (mh) => torso.t + mh / 2 + 0.02 * H);
    } else if (necklaceSide === "left") {
      placeGroup(by.get("necklace")!, "necklace", { w: 0.20, h: 0.11 }, 0.19 * W, (mh) => MY + mh / 2 + 0.01 * H);
    } else {
      placeGroup(by.get("necklace")!, "necklace", { w: 0.16, h: 0.07 }, 0.17 * W, 0.905 * H);
    }
  }
  if (has("brooch")) {
    placeGroup(by.get("brooch")!, "brooch", BOX.brooch, torso.l + 0.3 * torsoW, torso.t + 0.30 * torsoH);
  }

  // ── Wrist things (watch / bracelet / ring / gloves): hip height, beside the legs ──
  if (wristList.length && !useColumn) {
    const cx = Math.min(W - MX - 0.10 * W, Math.max(A.r + 0.09 * W, MX + 0.10 * W));
    placeGroup(wristList, "wrist", BOX.wrist, cx, (mh) => wristTop + mh / 2, "x");
  }

  // ── Anklet: just above the shoes ──
  if (has("anklet")) {
    if (shoeRects.length) {
      const S = union(shoeRects);
      placeGroup(by.get("anklet")!, "anklet", BOX.anklet, (S.l + S.r) / 2, (mh) => S.t - mh / 2 - 0.01 * H);
    } else {
      placeGroup(by.get("anklet")!, "anklet", BOX.anklet, 0.75 * W, 0.86 * H);
    }
  }

  const accList = [...(by.get("acc") ?? []), ...(beltList.length && !beltBeside ? beltList : [])];
  if (accList.length) placeGroup(accList, "acc", BOX.acc, 0.17 * W, 0.83 * H, "y");

  // Short pieces (a mini skirt, shorts) make a short composition: centre it vertically
  // in the free area instead of leaving it top-heavy. A full-length outfit already fills
  // the area, so its shift is ~0 and nothing changes for it.
  if (out.length) {
    const t = Math.min(...out.map((r) => r.y));
    const b = Math.max(...out.map((r) => r.y + r.h));
    const want = (MY + (H - MB)) / 2 - (t + b) / 2;
    const dy = Math.min(H - MB - b, Math.max(MY - t, want));
    if (Math.abs(dy) > 0.5) for (const r of out) r.y += dy;
  }

  // Bottoms left over when a dress is the anchor are intentionally not drawn
  // (a dress + trousers flat-lay reads as a collision, same as before).
  return out;
}
