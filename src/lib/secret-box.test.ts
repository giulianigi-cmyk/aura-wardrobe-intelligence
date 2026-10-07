// Run with: bun test src/lib/secret-box.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isSealed, MissingEncryptionKeyError, openSecret, sealSecret } from "./secret-box.server";

const KEY = "test-key-0123456789-abcdefghijklmnopqrstuvwxyz";

test("a sealed credential reads back the same and is not readable as stored", async () => {
  process.env.CALENDAR_ENCRYPTION_KEY = KEY;
  const sealed = await sealSecret("abcd-efgh-ijkl-mnop");
  assert.ok(isSealed(sealed));
  assert.ok(!sealed.includes("abcd-efgh"));
  assert.notEqual(sealed, await sealSecret("abcd-efgh-ijkl-mnop")); // fresh IV every time
  assert.equal(await openSecret(sealed), "abcd-efgh-ijkl-mnop");
});

test("a value saved before encryption is returned as it is (re-sealed by the caller)", async () => {
  process.env.CALENDAR_ENCRYPTION_KEY = KEY;
  assert.equal(await openSecret("legacy-plain-password"), "legacy-plain-password");
  assert.equal(isSealed("legacy-plain-password"), false);
});

test("an altered value or another key fails instead of returning garbage", async () => {
  process.env.CALENDAR_ENCRYPTION_KEY = KEY;
  const sealed = await sealSecret("secret");
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
  await assert.rejects(openSecret(tampered));
  process.env.CALENDAR_ENCRYPTION_KEY = KEY + "-other";
  await assert.rejects(openSecret(sealed));
});

test("without the server secret nothing is stored readable", async () => {
  delete process.env.CALENDAR_ENCRYPTION_KEY;
  await assert.rejects(sealSecret("secret"), MissingEncryptionKeyError);
  process.env.CALENDAR_ENCRYPTION_KEY = "short";
  await assert.rejects(sealSecret("secret"), MissingEncryptionKeyError);
});
