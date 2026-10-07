// Run with: bun test src/lib/web-push.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { b64u, encryptPayload, fromB64u, isAllowedPushEndpoint, vapidAuthorization } from "./web-push";

const enc = new TextEncoder();
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, n * 8));
}
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

test("a message encrypted for a browser decrypts with the browser's keys (RFC 8291)", async () => {
  // The "browser": its own key pair and auth secret, as a real subscription has.
  const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const payload = JSON.stringify({ title: "Buongiorno", body: "Oggi 14° · il tuo look ti aspetta" });

  const body = await encryptPayload({ endpoint: "https://fcm.googleapis.com/x", p256dh: b64u(uaPublic), auth: b64u(auth) }, payload);

  const salt = body.slice(0, 16);
  assert.deepEqual([...body.slice(16, 20)], [0, 0, 0x10, 0]);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, ciphertext));
  assert.equal(plain[plain.length - 1], 2);
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), payload);
});

test("the VAPID token is signed by AURA's key and addressed to the push service", async () => {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  const header = await vapidAuthorization("https://web.push.apple.com/abc", { publicKey: pub, privateKey: kp.privateKey }, "https://aura.example", 1000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(m);
  assert.equal(m![4], pub);
  const claims = JSON.parse(new TextDecoder().decode(fromB64u(m![2])));
  assert.deepEqual(claims, { aud: "https://web.push.apple.com", exp: 1000 + 12 * 3600, sub: "https://aura.example" });
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, fromB64u(m![3]), enc.encode(`${m![1]}.${m![2]}`));
  assert.equal(ok, true);
});

test("only real push services are accepted as endpoints", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isAllowedPushEndpoint("https://web.push.apple.com/QH"), true);
  assert.equal(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(isAllowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x"), true);
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com"), false);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x"), false);
  assert.equal(isAllowedPushEndpoint("not a url"), false);
});
