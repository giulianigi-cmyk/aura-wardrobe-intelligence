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

export type LayoutInput = { id: string; bucket: Bucket; /** height / width of the visible garment */ aspect: number };
export type LayoutRect = { id: string; bucket: Bucket; /** top-left, canvas px */ x: number; y: number; w: number; h: number; z: number };

const MARGIN = 0.04; // min distance from canvas edge (fraction)
const GROUP_SHRINK = 0.75; // when several items share one slot

/** Max box per bucket: [max width, max height], fractions of canvas W / H. */
const BOX: Record<Bucket, { w: number; h: number }> = {
  dress: { w: 0.46, h: 0.80 },
  bottom: { w: 0.42, h: 0.70 },
  top: { w: 0.42, h: 0.37 },
  outer: { w: 0.42, h: 0.72 },
  shoes: { w: 0.34, h: 0.14 },
  bag: { w: 0.32, h: 0.30 },
  sunglasses: { w: 0.28, h: 0.10 },
  headwear: { w: 0.22, h: 0.12 },
  earrings: { w: 0.12, h: 0.12 },
  necklace: { w: 0.24, h: 0.14 },
  brooch: { w: 0.07, h: 0.07 },
  wrist: { w: 0.10, h: 0.15 }, // watch, bracelet, ring, gloves
  anklet: { w: 0.14, h: 0.06 },
  belt: { w: 0.36, h: 0.06 },
  acc: { w: 0.22, h: 0.16 },
};
const TOP_AS_ANCHOR = { w: 0.50, h: 0.45 };

const Z: Record<Bucket, number> = { outer: 1, dress: 2, bottom: 2, belt: 3, top: 4, shoes: 5, bag: 5, sunglasses: 5, headwear: 5, earrings: 5, necklace: 6, brooch: 6, wrist: 5, anklet: 5, acc: 5 };

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

export function layoutOutfit(items: LayoutInput[], W = CANVAS_W, H = CANVAS_H): LayoutRect[] {
  if (!items.length) return [];
  const MX = MARGIN * W;
  const MY = MARGIN * H;
  const by = new Map<Bucket, LayoutInput[]>();
  for (const it of items) by.set(it.bucket, [...(by.get(it.bucket) ?? []), it]);
  const has = (b: Bucket) => (by.get(b)?.length ?? 0) > 0;

  const out: LayoutRect[] = [];
  const clampC = (c: number, size: number, lo: number, hi: number) => Math.min(Math.max(c, lo + size / 2), hi - size / 2);

  /** Size = fit inside the bucket box using the real aspect ratio. */
  const sizeOf = (it: LayoutInput, box: Box, shrink: number) => {
    const aspect = it.aspect > 0 ? it.aspect : 1;
    const w = Math.min(box.w * W * shrink, (box.h * H * shrink) / aspect);
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
    let cursor = 0;
    const total = sizes.reduce((a, s) => a + (axis === "x" ? s.w : s.h) * 0.95, 0) - (axis === "x" ? sizes[sizes.length - 1].w : sizes[sizes.length - 1].h) * 0.05;
    cursor = -total / 2;
    list.forEach((it, i) => {
      const s = sizes[i];
      const span = (axis === "x" ? s.w : s.h) * 0.95;
      const off = cursor + span / 2;
      cursor += span;
      const px = clampC(axis === "x" ? cx + off : cx, s.w, MX, W - MX);
      const py = clampC(axis === "y" ? cyv + off : cyv, s.h, MY, H - MY);
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
    const cw = (W - 2 * MX) / cols, ch = (H - 2 * MY) / Math.max(rows, 1);
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
  // head-level things beside the neckline, necklace ON the neckline, wrist
  // things at hip height beside the legs (where the hands hang).
  const torso = topRects.length
    ? union(topRects)
    : anchorBucket === "dress"
      ? { l: A.l, r: A.r, t: A.t, b: A.t + 0.5 * aH }
      : anchorBucket === "top"
        ? A
        : { l: A.l, r: A.r, t: MY, b: A.t }; // bottom only: virtual torso above the waist
  const torsoW = torso.r - torso.l, torsoH = torso.b - torso.t;
  const torsoCx = (torso.l + torso.r) / 2;
  const wristTop =
    anchorBucket === "dress" ? A.t + 0.42 * aH
    : anchorBucket === "bottom" ? (topRects.length ? torso.b + 0.03 * H : A.t + 0.10 * H)
    : A.b - 0.15 * H;

  // ── Belt: full waist width, on the waistband (only with dress / bottom) ──
  const beltList = by.get("belt") ?? [];
  const beltOnWaist = beltList.length > 0 && anchorBucket !== "top";
  if (beltOnWaist) {
    const waistY = anchorBucket === "bottom" ? A.t + 0.04 * H : A.t + 0.38 * aH;
    const bw = Math.min(BOX.belt.w, (0.9 * aW) / W);
    placeGroup(beltList, "belt", { w: bw, h: BOX.belt.h }, anchorCx, waistY, "y");
  }

  // ── Shoes: free bottom-right corner, ≤ ~20% overlap with the anchor ──
  let shoeRects: LayoutRect[] = [];
  if (has("shoes")) {
    const shoeBox = outer ? { w: 0.30, h: 0.13 } : BOX.shoes; // narrower when the coat takes the left side
    const ws = shoeBox.w * W * (by.get("shoes")!.length > 1 ? GROUP_SHRINK : 1);
    const cx = Math.min(W - MX - ws / 2, A.r + ws / 2 - 0.2 * ws);
    // Several pairs: stack them in the corner instead of fanning sideways (a sideways
    // fan would push the first pair back under the anchor).
    shoeRects = placeGroup(by.get("shoes")!, "shoes", shoeBox, Math.max(cx, 0.75 * W), (outer ? 0.86 : 0.80) * H, by.get("shoes")!.length > 1 ? "y" : "x");
  }

  // ── Bag: free side, slightly tucked against the anchor ──
  if (has("bag")) {
    const bw = BOX.bag.w * W;
    if (outer) placeGroup(by.get("bag")!, "bag", BOX.bag, W - MX - bw / 2, 0.67 * H, "y");
    else placeGroup(by.get("bag")!, "bag", BOX.bag, Math.max(MX + bw / 2, A.l - 0.3 * bw), 0.58 * H, "y");
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
  const wristList = [...(by.get("wrist") ?? []), ...(outer ? by.get("headwear") ?? [] : [])];
  if (has("headwear") && !outer) {
    placeGroup(by.get("headwear")!, "headwear", BOX.headwear, 0.22 * W, (mh) => MY + mh / 2 + 0.01 * H);
  }

  // ── On the body: necklace on the neckline, brooch on the chest ──
  if (has("necklace")) {
    const nb = { w: Math.min(BOX.necklace.w, (0.6 * torsoW) / W), h: BOX.necklace.h };
    placeGroup(by.get("necklace")!, "necklace", nb, torsoCx, (mh) => torso.t + mh / 2 + 0.02 * torsoH);
  }
  if (has("brooch")) {
    placeGroup(by.get("brooch")!, "brooch", BOX.brooch, torso.l + 0.3 * torsoW, torso.t + 0.30 * torsoH);
  }

  // ── Wrist things (watch / bracelet / ring / gloves): hip height, beside the legs ──
  if (wristList.length) {
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

  const accList = [...(by.get("acc") ?? []), ...(beltList.length && !beltOnWaist ? beltList : [])];
  if (accList.length) placeGroup(accList, "acc", BOX.acc, 0.17 * W, 0.83 * H, "y");

  // Bottoms left over when a dress is the anchor are intentionally not drawn
  // (a dress + trousers flat-lay reads as a collision, same as before).
  return out;
}
