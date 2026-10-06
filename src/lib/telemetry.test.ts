// Run with: bun test src/lib/telemetry.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { errorFingerprint, platformOf, scrubText } from "./telemetry";

test("error text loses e-mails, tokens, keys, query strings, ids, data URLs and long blobs", () => {
  const raw = "Failed for giulia.test@example.com Bearer abc.def-123 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij " +
    "sb_secret_ABCDEFGHIJKLMNOP https://x.supabase.co/storage/v1/object/sign/a.png?token=SECRET#frag " +
    "user 32ff3367-afb3-4229-9960-cdcb882961cd data:image/png;base64,iVBORw0KGgoAAAANSUhEUg== " +
    "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9w";
  const out = scrubText(raw, 2000);
  for (const leak of ["giulia.test@example.com", "abc.def-123", "eyJhbGci", "sb_secret_ABC", "token=SECRET", "#frag", "32ff3367", "iVBORw0", "QUJDREVGR0hJ"]) {
    assert.ok(!out.includes(leak), `${leak} still in: ${out}`);
  }
  assert.ok(out.includes("https://x.supabase.co/storage/v1/object/sign/a.png"));
  assert.ok(out.includes("<email>") && out.includes("<id>"));
});

test("error text is cut to the limit", () => {
  assert.equal(scrubText("x ".repeat(500), 300).length, 300);
});

test("the same error gets the same fingerprint whatever its numbers; a different one does not", () => {
  const a = errorFingerprint("logged", "[AURA x] failed after 1200 ms", "Error\n    at load (https://app/assets/a.js?v=1:10:5)");
  const b = errorFingerprint("logged", "[AURA x] failed after 980 ms", "Error\n    at load (https://app/assets/a.js?v=2:12:9)");
  const c = errorFingerprint("logged", "[AURA y] failed", "Error\n    at other (https://app/assets/b.js:1:1)");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, errorFingerprint("crash", "[AURA x] failed after 1200 ms", "Error\n    at load (https://app/assets/a.js:10:5)"));
});

test("platform is only a coarse family", () => {
  assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", false), "ios-web");
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 14)", true), "android-app");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh)", false), "desktop-web");
});
