// Clean-up of the free, in-browser cutout (bg-removal-client.ts). On photos taken on a floor or a
// bed the model often keeps pieces of the background: a patch of floor detached from the garment,
// a pale shadow under the hem, a faint haze around it. Those are saved with the item and show up
// in the wardrobe and on every canvas. This pass removes them, on plain RGBA pixels (no DOM), so
// it is the same for every photo and testable:
//   1. pixels that are only partly opaque AND the colour of the photo's background (estimated
//      from the original photo's border) are background residue: made transparent. Solid pixels
//      are never touched, so a garment the same colour as the floor keeps its body;
//   2. near-invisible haze (alpha under HAZE_ALPHA) is made transparent;
//   3. visible regions not connected to the garment and much smaller than it (under
//      ISLAND_RATIO of the largest region) are removed; regions of comparable size are kept, so
//      pairs (shoes, earrings) and multi-piece items stay whole.

export type Rgb = [number, number, number];

const HAZE_ALPHA = 32;
const SOLID_ALPHA = 230;
const BG_COLOR_DISTANCE = 48;
const ISLAND_RATIO = 0.05;
/** The photo border must be this uniform to be trusted: this share of its samples within
 *  BG_COLOR_DISTANCE of its median colour. A share, not a mean, so a garment that touches the edge
 *  of a product photo (a sweater filling the frame) does not make a plain white border "busy". */
const BG_MIN_AGREEMENT = 0.75;

const dist = (r: number, g: number, b: number, c: Rgb) => Math.hypot(r - c[0], g - c[1], b - c[2]);

/** The background colour of the ORIGINAL photo, from its outer border, or null when the border is
 *  not a fairly uniform colour (busy background: no colour rule is safe then). */
export function estimateBackground(rgba: Uint8ClampedArray, w: number, h: number): Rgb | null {
  if (w < 4 || h < 4) return null;
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.03));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const step = Math.max(1, Math.round((w + h) / 400));
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (rgba[i + 3] < 200) return; // already transparent: not a photo border
    rs.push(rgba[i]); gs.push(rgba[i + 1]); bs.push(rgba[i + 2]);
  };
  for (let d = 0; d < band; d++) {
    for (let x = 0; x < w; x += step) { take(x, d); take(x, h - 1 - d); }
    for (let y = 0; y < h; y += step) { take(d, y); take(w - 1 - d, y); }
  }
  if (rs.length < 20) return null;
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const c: Rgb = [med(rs.slice()), med(gs.slice()), med(bs.slice())];
  let agree = 0;
  for (let i = 0; i < rs.length; i++) if (dist(rs[i], gs[i], bs[i], c) < BG_COLOR_DISTANCE) agree++;
  return agree / rs.length >= BG_MIN_AGREEMENT ? c : null;
}

/** Clearly not background in the original photo: this far from the background colour. */
const FOREGROUND_DISTANCE = 64;
/** A cutout must keep at least this share of what is clearly the garment in the original. */
export const MIN_KEPT_FOREGROUND = 0.7;

/** On a photo with a plain background: the share of the pixels that are clearly NOT background in
 *  the original (the garment) that the cutout kept solid. A dark garment on white whose body the
 *  model erased — a navy sweater of which only the light motif survived — scores far below 1.
 *  Null when there is too little foreground to judge. */
export function keptForegroundRatio(original: Uint8ClampedArray, cutout: Uint8ClampedArray, w: number, h: number, bg: Rgb): number | null {
  let fg = 0, kept = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (original[i + 3] < 200 || dist(original[i], original[i + 1], original[i + 2], bg) < FOREGROUND_DISTANCE) continue;
    fg++;
    if (cutout[i + 3] >= 128) kept++;
  }
  return fg >= w * h * 0.01 ? kept / fg : null;
}

/** A cutout made from the colour alone: the plain background reachable from the photo's border
 *  becomes transparent, everything else stays. The safe fallback for a product photo on white
 *  when the model failed — a light part of the garment enclosed by darker fabric is never reached,
 *  so it stays. Returns a new RGBA buffer. */
export function colorKeyCutout(original: Uint8ClampedArray, w: number, h: number, bg: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(original);
  const n = w * h;
  const isBg = (p: number) => dist(original[p * 4], original[p * 4 + 1], original[p * 4 + 2], bg) < BG_COLOR_DISTANCE;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (p: number) => { if (!seen[p] && isBg(p)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    out[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  return out;
}

/** Cleans a cutout in place (RGBA, straight alpha). Returns how many pixels became transparent. */
export function cleanCutout(rgba: Uint8ClampedArray, w: number, h: number, bg: Rgb | null): number {
  const n = w * h;
  let cleared = 0;
  const clear = (p: number) => { if (rgba[p * 4 + 3] !== 0) { rgba[p * 4 + 3] = 0; cleared++; } };

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = rgba[i + 3];
    if (a === 0) continue;
    if (a < HAZE_ALPHA) { clear(p); continue; }
    if (bg && a < SOLID_ALPHA && dist(rgba[i], rgba[i + 1], rgba[i + 2], bg) < BG_COLOR_DISTANCE) clear(p);
  }

  // Connected visible regions (8-neighbourhood).
  const label = new Int32Array(n);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let p = 0; p < n; p++) {
    if (label[p] || rgba[p * 4 + 3] === 0) continue;
    const id = sizes.length;
    let size = 0;
    label[p] = id;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      size++;
      const x = q % w, y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          const r = yy * w + xx;
          if (!label[r] && rgba[r * 4 + 3] !== 0) { label[r] = id; stack.push(r); }
        }
      }
    }
    sizes.push(size);
  }
  let largest = 0;
  for (const s of sizes) if (s > largest) largest = s;
  if (largest === 0) return cleared;
  const keep = sizes.map((s) => s >= largest * ISLAND_RATIO);
  for (let p = 0; p < n; p++) if (label[p] && !keep[label[p]]) clear(p);
  return cleared;
}

// ── White halo on the outfit canvas ─────────────────────────────────────────────────────────────
// Pieces composed on the board (compose-outfit-canvas.ts) showed a white rim, or a whole white box,
// that covered the piece beside them: a black long-sleeve top over black trousers left a white band
// across the trousers. Three causes, all fixed here on plain pixels:
//   1. a photo that was never cut out (opaque, plain light background): the background reachable from
//      the border becomes transparent (colorKeyCutout);
//   2. a cutout that kept a fringe of the old background along its edge — near-white, or the light
//      grey of a blend between the garment and the white/grey floor (a navy blazer with a ragged
//      white-grey outline): pixels much lighter than the piece (or, on a white or cream piece, much
//      darker and neutral: a grey shadow) are peeled off the edge, a few pixels deep. Where that
//      colour goes on deeper than the peel it is a real part of the piece (a white collar band, a
//      white sole) and it is put back there — only there, so one white detail no longer keeps the
//      whole rim;
//   3. the half-transparent edge pixels the model left tinted with the old background: their colour
//      is taken from the solid piece beside them (their transparency stays, so the edge stays soft).
const HALO_RADIUS = 2;
const NEAR_WHITE_MIN = 200;
const NEAR_WHITE_CHROMA = 30;
const LIGHT_PIECE_LUMA = 180;
/** After keying out a white background, at least this share of the photo must remain (the piece). */
const MIN_KEYED_PIECE = 0.08;
/** Below this alpha a pixel counts as transparent (the edge the fringe touches). */
const CLEAR_ALPHA = 16;
/** A fringe pixel differs from the piece's typical luma by at least this much... */
const FRINGE_CONTRAST = 70;
/** ...is at least this light on a dark piece... */
const FRINGE_MIN_LUMA = 150;
/** ...and is a neutral (white / grey) colour, not the garment's own colour. */
const FRINGE_CHROMA = 45;
/** Half-transparent edge pixels are re-coloured from solid pixels at most this far away. */
const DECONTAMINATE_DEPTH = 6;

const isNearWhite = (r: number, g: number, b: number) =>
  Math.min(r, g, b) >= NEAR_WHITE_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= NEAR_WHITE_CHROMA;
const lumaOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Removes a white background box or a light/grey fringe from a piece before it is drawn on the
 *  board, in place (RGBA, straight alpha). Returns how many pixels were changed. */
export function removeWhiteHalo(rgba: Uint8ClampedArray, w: number, h: number): number {
  const n = w * h;
  let cleared = 0;
  let transparent = 0;
  for (let p = 0; p < n; p++) if (rgba[p * 4 + 3] < CLEAR_ALPHA) transparent++;

  // 1. Never cut out: plain light background → keyed out from the border. A white or cream piece
  //    on a white photo would be keyed away with it: when what is left is too little to be the
  //    piece, nothing is changed (the box stays — better than a missing or see-through garment).
  if (transparent < n * 0.01) {
    const bg = estimateBackground(rgba, w, h);
    if (bg && isNearWhite(bg[0], bg[1], bg[2])) {
      const keyed = colorKeyCutout(rgba, w, h, bg);
      let kept = 0;
      const keptLuma: number[] = [];
      for (let p = 0; p < n; p++) {
        if (keyed[p * 4 + 3] === 0) continue;
        kept++;
        if (p % 7 === 0) keptLuma.push(lumaOf(keyed[p * 4], keyed[p * 4 + 1], keyed[p * 4 + 2]));
      }
      keptLuma.sort((a, b) => a - b);
      // a light piece (white, cream, beige) is never keyed: its own edge may be taken for background
      const lightPiece = keptLuma.length > 0 && keptLuma[keptLuma.length >> 1] >= LIGHT_PIECE_LUMA;
      if (kept >= n * MIN_KEYED_PIECE && !lightPiece) {
        for (let p = 0; p < n; p++) {
          if (keyed[p * 4 + 3] === 0 && rgba[p * 4 + 3] !== 0) { rgba[p * 4 + 3] = 0; cleared++; }
        }
      }
    }
  }
  // An opaque photo that could not be keyed has no edge to clean.
  let clearNow = 0;
  for (let p = 0; p < n; p++) if (rgba[p * 4 + 3] < CLEAR_ALPHA) clearNow++;
  if (clearNow < n * 0.01) return cleared;

  // The piece's typical luma, from its solid pixels.
  const lumas: number[] = [];
  const step = Math.max(1, Math.floor(n / 20000));
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    if (rgba[i + 3] >= 230) lumas.push(lumaOf(rgba[i], rgba[i + 1], rgba[i + 2]));
  }
  if (!lumas.length) return cleared;
  lumas.sort((a, b) => a - b);
  const pieceLuma = lumas[lumas.length >> 1];
  const lightPiece = pieceLuma >= LIGHT_PIECE_LUMA;
  const lightLimit = Math.max(FRINGE_MIN_LUMA, pieceLuma + FRINGE_CONTRAST);
  const darkLimit = pieceLuma - FRINGE_CONTRAST;
  const isFringe = (i: number) => {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > FRINGE_CHROMA) return false;
    const l = lumaOf(r, g, b);
    return lightPiece ? l <= darkLimit : l >= lightLimit;
  };

  // 2. Peel the fringe off the edge, `radius` passes; one more pass finds where it goes deeper.
  const radius = Math.max(HALO_RADIUS, Math.round(Math.max(w, h) / 180));
  const peeled = new Uint8Array(n); // 1 = peeled, 2 = the fringe colour still found one pass deeper
  const peeledList: number[] = [];
  const savedAlpha = new Uint8Array(n);
  const deep: number[] = [];
  // Fringe pixels on the edge (touching transparency or the photo border).
  const edgeOf = (softOnly: boolean) => {
    const edge: number[] = [];
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      if (rgba[i + 3] < CLEAR_ALPHA || (softOnly && rgba[i + 3] >= 230) || !isFringe(i)) continue;
      const x = p % w, y = (p - x) / w;
      const touches = x === 0 || y === 0 || x === w - 1 || y === h - 1
        || rgba[(p - 1) * 4 + 3] < CLEAR_ALPHA || rgba[(p + 1) * 4 + 3] < CLEAR_ALPHA
        || rgba[(p - w) * 4 + 3] < CLEAR_ALPHA || rgba[(p + w) * 4 + 3] < CLEAR_ALPHA;
      if (touches) edge.push(p);
    }
    return edge;
  };
  const peel = (edge: number[]) => {
    for (const p of edge) {
      peeled[p] = 1;
      peeledList.push(p);
      savedAlpha[p] = rgba[p * 4 + 3];
      rgba[p * 4 + 3] = 0;
    }
  };
  // The half-transparent part of the fringe (the model's soft edge) goes first and does not count
  // towards the depth: only the solid fringe has to be thin.
  for (let d = 0; d < DECONTAMINATE_DEPTH; d++) {
    const edge = edgeOf(true);
    if (!edge.length) break;
    peel(edge);
  }
  for (let pass = 0; pass <= radius; pass++) {
    const edge = edgeOf(false);
    if (!edge.length) break;
    if (pass === radius) { for (const p of edge) { peeled[p] = 2; deep.push(p); } break; }
    peel(edge);
  }
  // Put back the peeled pixels joined to where the colour goes deeper (a real white part), up to
  // radius + 1 steps from it; the thin fringe elsewhere stays removed.
  let front = deep;
  for (let d = 0; d <= radius && front.length; d++) {
    const next: number[] = [];
    for (const q of front) {
      const x = q % w, y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const r = yy * w + xx;
          if (peeled[r] !== 1) continue;
          peeled[r] = 3; // restored
          rgba[r * 4 + 3] = savedAlpha[r];
          next.push(r);
        }
      }
    }
    front = next;
  }
  for (const p of peeledList) if (peeled[p] === 1) cleared++;

  // 3. Half-transparent edge pixels tinted with the old background take the colour of the solid
  //    piece beside them, wave by wave outwards from the solid pixels.
  const done = new Uint8Array(n);
  let wave: number[] = [];
  for (let p = 0; p < n; p++) if (rgba[p * 4 + 3] >= 230) done[p] = 1;
  for (let p = 0; p < n; p++) {
    const a = rgba[p * 4 + 3];
    if (a < CLEAR_ALPHA || a >= 230) continue;
    const x = p % w, y = (p - x) / w;
    if ((x > 0 && done[p - 1]) || (x < w - 1 && done[p + 1]) || (y > 0 && done[p - w]) || (y < h - 1 && done[p + w])) wave.push(p);
  }
  for (let d = 0; d < DECONTAMINATE_DEPTH && wave.length; d++) {
    const colours: number[] = [];
    for (const p of wave) {
      const x = p % w, y = (p - x) / w;
      let r = 0, g = 0, b = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!done[q]) continue;
          r += rgba[q * 4]; g += rgba[q * 4 + 1]; b += rgba[q * 4 + 2]; k++;
        }
      }
      colours.push(r / k, g / k, b / k);
    }
    const next: number[] = [];
    wave.forEach((p, j) => {
      const i = p * 4;
      if (isFringe(i)) {
        rgba[i] = colours[j * 3]; rgba[i + 1] = colours[j * 3 + 1]; rgba[i + 2] = colours[j * 3 + 2];
        cleared++;
      }
      done[p] = 1;
    });
    for (const p of wave) {
      const x = p % w, y = (p - x) / w;
      const add = (q: number) => {
        const a = rgba[q * 4 + 3];
        if (!done[q] && a >= CLEAR_ALPHA && a < 230) { done[q] = 4; next.push(q); }
      };
      if (x > 0) add(p - 1);
      if (x < w - 1) add(p + 1);
      if (y > 0) add(p - w);
      if (y < h - 1) add(p + w);
    }
    // `done = 4` only reserved the slot in the next wave; it has no colour yet
    for (const q of next) done[q] = 0;
    wave = next;
  }
  return cleared;
}
