// Run with: bun test src/lib/reanalyze-wardrobe.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { completionPatch, needsCompletion } from "./reanalyze-wardrobe.functions";

const row = (o: Record<string, unknown> = {}) => ({
  id: "x", image_url: "u/x.png", category: "Bags", subcategory: null, style_tags: [], details: null, attrs_backfilled_at: null, user_edited_fields: [],
  formality: 4, occasion: "Evening", season: "All Seasons", day_evening: "both", sleeve_length: null, fit: null, heel_height: null,
  toe_shape: null, closure: "Buckle", gender: "Woman", material: ["Leather"], ...o,
}) as never;
const analysis = (o: Record<string, unknown> = {}) => ({
  category: "Bags", subcategory: "Shoulder Bag", colors: [], styles: [], occasions: ["Work"], seasons: ["Autumn"], brand: "", materials: ["Suede"],
  length: "", sleeveLength: "", fit: "", heelHeight: "", toeShape: "", closure: "Zip", gender: "Woman", styleTags: ["Minimal"],
  formality: 3, dayEvening: "day", detectedProductCode: "", detectedManufacturer: "", details: ["shoulder", "crossbody", "quilted"], ...o,
}) as never;

test("fills the missing type and details (black YSL bag with no type on file)", () => {
  const p = completionPatch(row(), analysis());
  assert.equal(p.subcategory, "Shoulder Bag");
  assert.deepEqual(p.details, ["shoulder", "crossbody", "quilted"]);
  assert.deepEqual(p.style_tags, ["Minimal"]); // were empty
  assert.ok(p.attrs_backfilled_at);
});

test("never overwrites existing values or what the person edited by hand", () => {
  const p = completionPatch(row({ subcategory: null, style_tags: ["Elegant"], user_edited_fields: ["subcategory"] }), analysis());
  assert.equal("subcategory" in p, false);   // the person cleared/edited it
  assert.equal("style_tags" in p, false);    // already had tags (used to be overwritten every run)
  assert.equal("closure" in p, false);       // Buckle stays, not Zip
  assert.equal("material" in p, false);
  assert.equal("formality" in p, false);
});

test("type only when the analysis sees the same category", () => {
  assert.equal("subcategory" in completionPatch(row(), analysis({ category: "Accessories", subcategory: "Belt" })), false);
});

test("processed once: an analysed piece is not picked again", () => {
  assert.equal(needsCompletion(row()), true);
  assert.equal(needsCompletion(row({ details: [], attrs_backfilled_at: "2026-10-03" })), false);
  assert.equal(needsCompletion(row({ details: [], attrs_backfilled_at: "2026-10-03", formality: null })), false); // AI couldn't tell: not retried forever
  assert.equal(needsCompletion(row({ details: [], attrs_backfilled_at: null, formality: null })), true);
});
