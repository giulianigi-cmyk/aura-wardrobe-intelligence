// Run with: bun test src/lib/push-ask.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { askedMoments, markAsked, pushAskAllowed } from "./push-ask";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

test("each moment is asked once, per person", () => {
  assert.equal(askedMoments("u").size, 0);
  markAsked("u", "piece");
  assert.deepEqual([...askedMoments("u")], ["piece"]);
  markAsked("u", "outfit");
  markAsked("u", "piece");
  assert.equal(askedMoments("u").size, 2);
  assert.equal(askedMoments("v").size, 0);
});

test("asked only where a tap can turn notifications on, or the install steps help", () => {
  const asked = new Set<"piece" | "outfit">();
  assert.equal(pushAskAllowed({ availability: "ready", deviceOn: false, asked, moment: "piece" }), true);
  assert.equal(pushAskAllowed({ availability: "needs-install", deviceOn: false, asked, moment: "piece" }), true);
  assert.equal(pushAskAllowed({ availability: "denied", deviceOn: false, asked, moment: "piece" }), false);
  assert.equal(pushAskAllowed({ availability: "unsupported", deviceOn: false, asked, moment: "piece" }), false);
  assert.equal(pushAskAllowed({ availability: "ready", deviceOn: true, asked, moment: "piece" }), false);
  assert.equal(pushAskAllowed({ availability: "ready", deviceOn: false, asked: new Set(["piece"]), moment: "piece" }), false);
  assert.equal(pushAskAllowed({ availability: "ready", deviceOn: false, asked: new Set(["piece"]), moment: "outfit" }), true);
});
