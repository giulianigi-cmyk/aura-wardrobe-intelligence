// Run with: bun test src/lib/purchase-fashion.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyFashionSignals, FashionSignalsSchema, type FashionSignals } from "./purchase-fashion";

const f = (o: Partial<FashionSignals>): FashionSignals => ({ iconic: false, timeless: false, onTrend: false, statusPiece: false, versatility: "medium", note: "", ...o });
const maybe = { verdict: "maybe" as const, confidence: "low" as const };
const ctx = { dressViolation: false, duplicate: null, pairsWithCount: 2, wardrobeGap: false };

test("iconic piece (Juste un Clou) with nothing similar owned: buy", () => {
  assert.equal(applyFashionSignals(maybe, f({ iconic: true, statusPiece: true }), { ...ctx, wardrobeGap: true }).verdict, "buy");
});

test("Louboutin patent slingback: similar (not identical) to owned pumps, iconic → buy", () => {
  assert.equal(applyFashionSignals(maybe, f({ iconic: true, onTrend: true }), { ...ctx, duplicate: { verdict: "maybe" } }).verdict, "buy");
});

test("never overrides a real duplicate or a dress-preference conflict", () => {
  const skip = { verdict: "skip" as const, confidence: "medium" as const };
  assert.equal(applyFashionSignals(skip, f({ iconic: true }), { ...ctx, duplicate: { verdict: "certain" } }).verdict, "skip");
  assert.equal(applyFashionSignals(skip, f({ iconic: true }), { ...ctx, dressViolation: true }).verdict, "skip");
});

test("on trend alone: buy only if versatile, not similar to anything, and pairs with the wardrobe", () => {
  assert.equal(applyFashionSignals(maybe, f({ onTrend: true }), ctx).verdict, "buy");
  assert.equal(applyFashionSignals(maybe, f({ onTrend: true, versatility: "low" }), ctx).verdict, "maybe");
  assert.equal(applyFashionSignals(maybe, f({ onTrend: true }), { ...ctx, duplicate: { verdict: "maybe" } }).verdict, "maybe");
});

test("nothing notable: verdict unchanged; lenient parsing", () => {
  assert.deepEqual(applyFashionSignals(maybe, f({}), ctx), maybe);
  assert.deepEqual(FashionSignalsSchema.parse({ iconic: "true", versatility: "huge" }), { iconic: true, timeless: false, onTrend: false, statusPiece: false, versatility: "medium", note: "" });
});
