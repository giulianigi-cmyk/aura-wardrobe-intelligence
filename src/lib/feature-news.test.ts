// Run with: bun test src/lib/feature-news.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { FEATURE_NEWS, NEWS_TEXT, newsCardAllowed, newsPushAllowed, nextNews } from "./feature-news";

test("the newest feature not used and not told yet", () => {
  assert.equal(nextNews({ told: new Set(), used: new Set() })?.id, "wishlist");
  assert.equal(nextNews({ told: new Set(["wishlist"]), used: new Set(["basket"]) })?.id, "sell");
  assert.equal(nextNews({ told: new Set(FEATURE_NEWS.map((n) => n.id)), used: new Set() }), null);
});

test("cards: not in the first days, at most one every few days", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  assert.equal(newsCardAllowed({ signedUpAt: "2026-11-09T10:00:00Z", lastShown: null, now }), false);
  assert.equal(newsCardAllowed({ signedUpAt: "2026-10-01T10:00:00Z", lastShown: null, now }), true);
  assert.equal(newsCardAllowed({ signedUpAt: "2026-10-01T10:00:00Z", lastShown: "2026-11-09T10:00:00Z", now }), false);
  assert.equal(newsCardAllowed({ signedUpAt: "2026-10-01T10:00:00Z", lastShown: "2026-11-06T10:00:00Z", now }), true);
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
      assert.ok(tx && tx.title && tx.body && tx.pushTitle && tx.pushBody, `${lang}/${n.id}`);
    }
  }
});
