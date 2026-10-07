// Web Push without a library, on Web Crypto (native on Cloudflare Workers and in the browser):
// the message is encrypted for the person's browser (RFC 8291, "aes128gcm") and the request is
// signed with AURA's VAPID key (RFC 8292). Pure functions only — the keys are loaded and the
// requests sent by push.server.ts.

export function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const enc = new TextEncoder();

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** The encrypted body for one subscription (RFC 8291 §3–4, a single record). */
export async function encryptPayload(target: PushTarget, payload: string): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64u(target.p256dh);
  const authSecret = fromB64u(target.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("invalid push subscription keys");

  const as = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One record: the payload followed by the 0x02 "last record" delimiter, no padding.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));

  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** The VAPID "Authorization" header value for a push service (RFC 8292): a JWT signed with the
 *  private key, valid 12 hours, plus the public key. */
export async function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: CryptoKey }, subject: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: subject })));
  const unsigned = `${header}.${claims}`;
  // Web Crypto's ECDSA signature is already the raw r‖s form a JWS needs.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${keys.publicKey}`;
}

/** Push services AURA sends to. A subscription pointing anywhere else is refused: the server would
 *  otherwise POST to an address chosen by whoever saved the subscription. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^web\.push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
