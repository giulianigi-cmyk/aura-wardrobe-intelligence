// Run with: bun test src/lib/outfit-match.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type { WardrobeItem } from "./aura-types";
import {
  colorNameSimilarity, colorSimilarity, combineVisual, mapVisualScores, rankCandidates,
  retrieveCandidates, retrievalScore, verdictForScore, CONFIDENCE, NO_VISUAL_CAP,
  type DetectedGarment, type VisualScore,
} from "./outfit-match";

let seq = 0;
function item(p: Partial<WardrobeItem> & { name: string }): WardrobeItem {
  seq++;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    category: "Bottoms", subcategory: "Trousers", colors: [], color: null, material: [],
    fit: null, length: null, sleeve_length: null, archived: false,
    ...p,
  } as unknown as WardrobeItem;
}
const v = (it: WardrobeItem, s: Partial<VisualScore>): VisualScore => ({
  id: it.id, overall: 50, color: 50, pattern: 50, silhouette: 50, material: 50, details: 50, sameItem: "maybe", reason: "", ...s,
});
const top = (d: DetectedGarment, w: WardrobeItem[]) => retrieveCandidates(d, w)[0]?.item;

// --- colour -----------------------------------------------------------------------------------

test("colour: near shades are close, neighbouring colours are not equivalent", () => {
  assert.ok(colorNameSimilarity("Jet Black", "Soft Black")! > 0.85);
  for (const [a, b] of [["Jet Black", "Navy"], ["Beige", "Camel"], ["Jet Black", "Charcoal"], ["Silver Grey", "Graphite"], ["Royal Blue", "Navy"], ["Chocolate", "Burgundy"], ["Olive", "Forest Green"]]) {
    assert.ok(colorNameSimilarity(a, b)! < 0.55, `${a} vs ${b} should not be treated as the same colour`);
  }
  // White vs ivory is close (lighting can blur it) but still clearly below an exact match.
  const wi = colorNameSimilarity("Pure White", "Ivory")!;
  assert.ok(wi < 0.9 && wi > 0.5);
  assert.equal(colorNameSimilarity("Navy", "Navy"), 1);
  assert.equal(colorSimilarity(["Unknown Colour"], ["Navy"]), null);
});

test("black vs navy: the navy trousers rank first for a navy detection", () => {
  const navy = item({ name: "navy", colors: ["Navy"] });
  const black = item({ name: "black", colors: ["Jet Black"] });
  assert.equal(top({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"] }, [black, navy]).id, navy.id);
  assert.equal(top({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"] }, [navy, black]).id, black.id);
});

test("black vs navy under bad light: a navy piece detected as black is still retrieved, and the visual check decides", () => {
  const navy = item({ name: "navy pinstripe", colors: ["Navy"] });
  const blacks = Array.from({ length: 4 }, (_, i) => item({ name: `black ${i}`, colors: ["Jet Black"] }));
  const retrieved = retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"] }, [...blacks, navy]);
  assert.ok(retrieved.some((r) => r.item.id === navy.id), "navy must stay among the candidates");
  const d = rankCandidates(retrieved, [
    v(navy, { overall: 92, color: 85, pattern: 95, silhouette: 90, details: 80, sameItem: "yes", reason: "stesso gessato blu" }),
    ...blacks.map((b) => v(b, { overall: 40, color: 30, pattern: 20, silhouette: 80, sameItem: "no" })),
  ]);
  assert.equal(d.match?.item.id, navy.id);
  assert.equal(d.confidence, "high");
  for (const b of blacks) assert.ok((d.candidates.find((c) => c.item.id === b.id)?.score ?? 0) <= 0.55);
});

test("white vs ivory, beige vs camel, light vs dark grey: the right shade ranks first", () => {
  const cases: [string, string, string][] = [["Pure White", "Ivory", "Tops"], ["Beige", "Camel", "Outerwear"], ["Dove Grey", "Charcoal", "Bottoms"]];
  for (const [a, b, cat] of cases) {
    const ia = item({ name: a, category: cat, subcategory: null, colors: [a] });
    const ib = item({ name: b, category: cat, subcategory: null, colors: [b] });
    assert.equal(top({ category: cat, colors: [a] }, [ib, ia]).id, ia.id, `${a} detected`);
    assert.equal(top({ category: cat, colors: [b] }, [ia, ib]).id, ib.id, `${b} detected`);
  }
});

// --- pattern ----------------------------------------------------------------------------------

test("pinstripe example: navy pinstripe > navy solid > black pinstripe, with coherent percentages", () => {
  const navyPin = item({ name: "navy pinstripe", colors: ["Navy"] });
  const navySolid = item({ name: "navy solid", colors: ["Navy"] });
  const blackPin = item({ name: "black pinstripe", colors: ["Jet Black"] });
  const greyDark = item({ name: "dark grey", colors: ["Charcoal"] });
  const retrieved = retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"], pattern: "pinstripe" }, [blackPin, navySolid, greyDark, navyPin]);
  const d = rankCandidates(retrieved, [
    v(navyPin, { overall: 95, color: 92, pattern: 95, silhouette: 90, material: 70, details: 70, sameItem: "yes" }),
    v(navySolid, { overall: 70, color: 90, pattern: 15, silhouette: 85, sameItem: "no" }),
    v(blackPin, { overall: 60, color: 30, pattern: 90, silhouette: 85, sameItem: "no" }),
    v(greyDark, { overall: 35, color: 35, pattern: 20, silhouette: 70, sameItem: "no" }),
  ]);
  assert.equal(d.confidence, "high");
  assert.deepEqual(d.candidates.map((c) => c.item.id).slice(0, 1), [navyPin.id]);
  assert.ok(d.candidates[0].score >= 0.9);
  // Both "almost" candidates are capped below the medium band: same colour OR same pattern is not enough.
  for (const id of [navySolid.id, blackPin.id]) assert.ok((d.candidates.find((c) => c.item.id === id)?.score ?? 0) < CONFIDENCE.medium);
});

test("pattern tags on wardrobe items (striped, checkered, floral, animal) steer retrieval", () => {
  const striped = item({ name: "striped", category: "Tops", subcategory: "Shirt", colors: ["Navy", "Striped"] });
  const solid = item({ name: "solid", category: "Tops", subcategory: "Shirt", colors: ["Navy"] });
  const checked = item({ name: "check", category: "Tops", subcategory: "Shirt", colors: ["Navy", "Checkered"] });
  const floral = item({ name: "floral", category: "Dresses", subcategory: "Wrap Dress", colors: ["Floral", "Powder Pink"] });
  const animal = item({ name: "animal", category: "Dresses", subcategory: "Wrap Dress", colors: ["Animal Print"] });
  assert.equal(top({ category: "Tops", subcategory: "Shirt", colors: ["Navy"], pattern: "stripes" }, [solid, checked, striped]).id, striped.id);
  assert.equal(top({ category: "Tops", subcategory: "Shirt", colors: ["Navy"], pattern: "check" }, [striped, solid, checked]).id, checked.id);
  assert.equal(top({ category: "Dresses", subcategory: "Wrap Dress", colors: ["Powder Pink"], pattern: "floral" }, [animal, floral]).id, floral.id);
  assert.equal(top({ category: "Dresses", subcategory: "Wrap Dress", colors: ["Camel"], pattern: "animal" }, [floral, animal]).id, animal.id);
});

// --- silhouette & material --------------------------------------------------------------------

test("silhouette: same colour and category but a different cut is not a strong match", () => {
  const wide = item({ name: "wide", colors: ["Jet Black"], fit: "Wide" });
  const slim = item({ name: "slim", colors: ["Jet Black"], fit: "Slim" });
  assert.equal(top({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"], fit: "Wide" }, [slim, wide]).id, wide.id);
  const s = combineVisual(v(slim, { overall: 80, color: 95, pattern: 90, silhouette: 20, sameItem: "maybe" }));
  assert.ok(s <= 0.6, `slim vs wide should be capped, got ${s}`);
  // straight vs flare, cropped vs full length, fitted vs oversized go through the same silhouette cap
  assert.ok(combineVisual(v(slim, { overall: 75, color: 90, pattern: 90, silhouette: 25 })) <= 0.6);
});

test("material: denim vs cotton, leather vs fabric, velvet vs wool, satin vs matte — overlap breaks ties", () => {
  const pairs: [string, string][] = [["Denim", "Cotton"], ["Leather", "Polyester"], ["Velvet", "Wool"], ["Silk", "Cotton"]];
  for (const [m1, m2] of pairs) {
    const a = item({ name: m1, category: "Bottoms", colors: ["Jet Black"], material: [m1] });
    const b = item({ name: m2, category: "Bottoms", colors: ["Jet Black"], material: [m2] });
    assert.equal(top({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"], materials: [m1] }, [b, a]).id, a.id, m1);
  }
  // Material counts, but less than colour or pattern: a material mismatch alone doesn't sink a match.
  const it = item({ name: "x", colors: ["Navy"] });
  assert.ok(combineVisual(v(it, { overall: 85, color: 90, pattern: 90, silhouette: 85, material: 30, details: 60, sameItem: "maybe" })) > CONFIDENCE.medium);
});

// --- similar items, absent item, fallback -----------------------------------------------------

test("near-identical pieces: no arbitrary winner — medium confidence, both shown with close percentages", () => {
  const a = item({ name: "a", colors: ["Jet Black"] });
  const b = item({ name: "b", colors: ["Jet Black"] });
  const d = rankCandidates(retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"] }, [a, b]), [
    v(a, { overall: 88, color: 92, pattern: 90, silhouette: 90, details: 60, sameItem: "yes" }),
    v(b, { overall: 86, color: 92, pattern: 90, silhouette: 88, details: 60, sameItem: "yes" }),
  ]);
  assert.equal(d.confidence, "medium");
  assert.equal(d.candidates.length, 2);
  assert.ok(Math.abs(d.candidates[0].score - d.candidates[1].score) < 0.05);
});

test("ten identical-looking black trousers by metadata: ranking is stable and never 'certain' without a visual check", () => {
  const blacks = Array.from({ length: 10 }, (_, i) => item({ name: `black ${i}`, colors: ["Jet Black"] }));
  const r1 = retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"] }, blacks);
  const r2 = retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Jet Black"] }, [...blacks].reverse());
  assert.deepEqual(r1.map((r) => r.item.id), r2.map((r) => r.item.id));
  const d = rankCandidates(r1, null);
  assert.notEqual(d.confidence, "high");
  assert.ok(d.candidates.every((c) => c.score <= NO_VISUAL_CAP));
});

test("absent item: beige blazer vs black / blue / grey blazers → no match is forced", () => {
  const blazers = ["Jet Black", "Navy", "Slate Grey"].map((c) => item({ name: c, category: "Outerwear", subcategory: "Blazer", colors: [c] }));
  const det: DetectedGarment = { category: "Outerwear", subcategory: "Blazer", colors: ["Beige"] };
  const retrieved = retrieveCandidates(det, blazers);
  for (const r of retrieved) assert.ok(r.retrieval < 0.6, "metadata already sees the colour mismatch");
  const d = rankCandidates(retrieved, retrieved.map((r) => v(r.item, { overall: 30, color: 10, pattern: 80, silhouette: 80, sameItem: "no" })));
  assert.equal(d.confidence, "low");
  assert.equal(d.match, null);
  // ...and without the visual check too: no match rather than the least-wrong blazer.
  assert.equal(rankCandidates(retrieved, null).match, null);
});

test("absent item with a same-colour lookalike: visual 'no' keeps it out", () => {
  const other = item({ name: "other navy", colors: ["Navy"] });
  const d = rankCandidates(retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"] }, [other]), [
    v(other, { overall: 55, color: 90, pattern: 85, silhouette: 40, details: 20, sameItem: "no", reason: "taglio diverso" }),
  ]);
  assert.equal(d.confidence, "low");
  assert.equal(d.match, null);
  assert.equal(d.candidates[0]?.reason, "taglio diverso"); // still listed as a weak alternative
});

test("hard photo (lighting): a colour difference the model attributes to light is not over-penalised", () => {
  const it = item({ name: "ivory", category: "Tops", colors: ["Ivory"] });
  // Warm light: the model is sure it is the same piece (overall 92) but its colour score is reduced.
  const s = combineVisual(v(it, { overall: 92, color: 70, pattern: 90, silhouette: 90, details: 75, sameItem: "yes" }));
  assert.ok(s >= CONFIDENCE.high, `got ${s}`);
  // A doubtful colour still leaves it a plausible candidate (medium), not discarded.
  const doubtful = combineVisual(v(it, { overall: 82, color: 55, pattern: 90, silhouette: 90, details: 75, sameItem: "maybe" }));
  assert.ok(doubtful >= CONFIDENCE.medium && doubtful < CONFIDENCE.high, `got ${doubtful}`);
});

test("visual check failed: metadata fallback is capped at medium, never auto-confirmed", () => {
  const exact = item({ name: "exact", colors: ["Navy"], fit: "Straight" });
  const d = rankCandidates(retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"], fit: "Straight" }, [exact]), null);
  assert.equal(d.visualChecked, false);
  assert.equal(d.confidence, "medium");
  assert.ok(d.match!.score <= NO_VISUAL_CAP);
});

test("a candidate the model skipped can't outrank verified ones", () => {
  const a = item({ name: "a", colors: ["Navy"] });
  const b = item({ name: "b", colors: ["Navy"] });
  const d = rankCandidates(retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"] }, [a, b]), [
    v(a, { overall: 80, color: 85, pattern: 85, silhouette: 80, sameItem: "maybe" }),
  ]);
  assert.equal(d.candidates[0].item.id, a.id);
});

test("shows at most 4 alternatives, best first", () => {
  const ws = Array.from({ length: 6 }, (_, i) => item({ name: `n${i}`, colors: ["Navy"] }));
  const r = retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"] }, ws);
  assert.ok(r.length <= 6);
  const d = rankCandidates(r, r.map((x, i) => v(x.item, { overall: 80 - i * 4, color: 85, pattern: 85, silhouette: 85, sameItem: "maybe" })));
  assert.ok(d.candidates.length <= 4);
  for (let i = 1; i < d.candidates.length; i++) assert.ok(d.candidates[i - 1].score >= d.candidates[i].score);
});

// --- plumbing ---------------------------------------------------------------------------------

test("category gate: other categories never match; blazer filed under Tops or Outerwear both match", () => {
  const shoe = item({ name: "shoe", category: "Shoes", subcategory: "Sneakers", colors: ["Pure White"] });
  assert.equal(retrievalScore({ category: "Tops", colors: ["Pure White"] }, shoe), 0);
  const blazerAsTop = item({ name: "blazer", category: "Tops", subcategory: "Blazer", colors: ["Beige"] });
  assert.ok(retrievalScore({ category: "Outerwear", subcategory: "Blazer", colors: ["Beige"] }, blazerAsTop) > 0.5);
});

test("visual neighbours from the embedding are let in even with poor metadata", () => {
  const mislabeled = item({ name: "mislabeled", colors: ["Pure White"] });
  const others = Array.from({ length: 6 }, (_, i) => item({ name: `o${i}`, colors: ["Navy"] }));
  const r = retrieveCandidates({ category: "Bottoms", subcategory: "Trousers", colors: ["Navy"] }, [...others, mislabeled], { visualIds: [mislabeled.id] });
  assert.ok(r.some((x) => x.item.id === mislabeled.id));
  assert.ok(r.length <= 6);
});

test("model answer mapping: refs map to ids, junk and duplicates are dropped, values clamped", () => {
  const ids = ["id-1", "id-2", "id-3"];
  const out = mapVisualScores([
    { ref: "C2", overall: 140, color: -5, pattern: 50, silhouette: 50, material: 50, details: 50, sameItem: "YES", reason: " ok " },
    { ref: "C2", overall: 10, color: 10, pattern: 10, silhouette: 10, material: 10, details: 10, sameItem: "no" },
    { ref: "C9", overall: 90, color: 90, pattern: 90, silhouette: 90, material: 90, details: 90, sameItem: "yes" },
    { ref: "banana", overall: 90, color: 90, pattern: 90, silhouette: 90, material: 90, details: 90, sameItem: "yes" },
    { ref: "c1", overall: Number.NaN, color: 50, pattern: 50, silhouette: 50, material: 50, details: 50, sameItem: "perhaps" },
  ], ids);
  assert.deepEqual(out.map((o) => o.id), ["id-2", "id-1"]);
  assert.equal(out[0].overall, 100);
  assert.equal(out[0].color, 0);
  assert.equal(out[0].sameItem, "yes");
  assert.equal(out[0].reason, "ok");
  assert.equal(out[1].overall, 0);
  assert.equal(out[1].sameItem, "maybe");
});

test("percentages follow the bands used by the UI", () => {
  assert.equal(verdictForScore(0.9), "certain");
  assert.equal(verdictForScore(0.7), "maybe");
  assert.equal(verdictForScore(0.5), "new");
  const it = item({ name: "x", colors: ["Navy"] });
  for (const o of [0, 30, 60, 75, 90, 100]) {
    const s = combineVisual(v(it, { overall: o, color: o, pattern: o, silhouette: o, material: o, details: o, sameItem: o >= 90 ? "yes" : "maybe" }));
    assert.ok(Math.abs(s - o / 100) < 0.13, `uniform ${o} → ${s}`); // derived from the scores, not decorative
  }
});
