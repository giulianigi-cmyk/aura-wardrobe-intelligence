// Run with: bun test src/lib/install-hint.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { installPlatform, shouldShowInstallHint } from "./install-hint";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IG = `${IPHONE} Instagram 350.0.0.0 (iPhone15,2; iOS 18_1)`;
const TIKTOK = `${ANDROID} musical_ly_2023 BytedanceWebview/d8a21c6`;
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

test("platform: phones get instructions, computers none, in-app browsers are told to open the browser", () => {
  assert.equal(installPlatform(IPHONE), "ios");
  assert.equal(installPlatform(ANDROID), "android");
  assert.equal(installPlatform(IG), "in-app");
  assert.equal(installPlatform(TIKTOK), "in-app");
  assert.equal(installPlatform(MAC, "MacIntel", 0), null);
  assert.equal(installPlatform(MAC, "MacIntel", 5), "ios"); // iPad reports itself as a Mac
});

test("shown only on a phone, outside the installed app, until dismissed", () => {
  assert.equal(shouldShowInstallHint({ platform: "ios", standalone: false, dismissed: false }), true);
  assert.equal(shouldShowInstallHint({ platform: "ios", standalone: true, dismissed: false }), false);
  assert.equal(shouldShowInstallHint({ platform: "android", standalone: false, dismissed: true }), false);
  assert.equal(shouldShowInstallHint({ platform: null, standalone: false, dismissed: false }), false);
});
