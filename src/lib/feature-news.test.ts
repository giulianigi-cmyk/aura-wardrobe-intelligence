// Run with: bun test src/lib/feature-news.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { FEATURE_NEWS, NEWS_TEXT, newsPushAllowed, nextNews } from "./feature-news";

test("told to people who signed up before, newest first, skipping what was used or told", () => {
  const old = "2026-09-01T10:00:00Z";
  assert.equal(nextNews({ signedUpAt: old, told: new Set(), used: new Set() })?.id, "wishlist");
  assert.equal(nextNews({ signedUpAt: old, told: new Set(["wishlist"]), used: new Set() })?.id, "compare");
  assert.equal(nextNews({ signedUpAt: old, told: new Set(), used: new Set(["wishlist", "compare"]) }), null);
  // Signed up after the wishlist arrived: the tour already shows it.
  assert.equal(nextNews({ signedUpAt: "2026-10-29T12:00:00Z", told: new Set(), used: new Set() }), null);
  assert.equal(nextNews({ signedUpAt: "2026-10-25T12:00:00Z", told: new Set(), used: new Set() })?.id, "wishlist");
});

test("push only to someone away for a few days, at most once a week", () => {
  const now = new Date("2026-11-10T17:30:00Z");
  assert.equal(newsPushAllowed({ lastNewsPush: null, lastOpen: "2026-11-01T08:00:00Z", today: "2026-11-10", now }), true);
  assert.equal(newsPushAllowed({ lastNewsPush: null, lastOpen: "2026-11-09T08:00:00Z", today: "2026-11-10", now }), false);
  assert.equal(newsPushAllowed({ lastNewsPush: "2026-11-05", lastOpen: null, today: "2026-11-10", now }), false);
  assert.equal(newsPushAllowed({ lastNewsPush: "2026-11-02", lastOpen: null, today: "2026-11-10", now }), true);
});

test("every news has its texts in every language", () => {
  for (const lang of ["it", "en", "fr", "es", "zh"]) {
    for (const n of FEATURE_NEWS) {
      const tx = NEWS_TEXT[lang][n.id];
      assert.ok(tx.title && tx.body && tx.pushTitle && tx.pushBody, `${lang}/${n.id}`);
    }
  }
});
