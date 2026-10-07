// Encryption at rest for credentials AURA must keep in readable form to use them later — today the
// iCloud app-specific password a person enters to connect their calendar (calendar_connections).
// AES-256-GCM through Web Crypto (native on Cloudflare Workers), with the key derived (HKDF) from the
// CALENDAR_ENCRYPTION_KEY secret, which lives only in the server's environment.
//
// Stored form: "enc:v1:<iv>:<ciphertext>" (base64url). A value without that prefix was saved before
// encryption existed: openSecret returns it unchanged and the caller re-saves it sealed.

const PREFIX = "enc:v1:";
const MIN_SECRET_LENGTH = 32;

let keyPromise: Promise<CryptoKey> | null = null;
let keySource: string | null = null;

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("CALENDAR_ENCRYPTION_KEY is not set (or shorter than 32 characters)");
  }
}

async function key(): Promise<CryptoKey> {
  const secret = process.env.CALENDAR_ENCRYPTION_KEY ?? "";
  if (secret.length < MIN_SECRET_LENGTH) throw new MissingEncryptionKeyError();
  if (!keyPromise || keySource !== secret) {
    keySource = secret;
    keyPromise = (async () => {
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("aura-secret-box"), info: new TextEncoder().encode("calendar-credentials-v1") },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
  }
  return keyPromise;
}

export function isSealed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/** Encrypts a credential for storage. Throws MissingEncryptionKeyError without the server secret:
 *  a credential is never stored readable. */
export async function sealSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain)));
  return `${PREFIX}${b64u(iv)}:${b64u(ct)}`;
}

/** The credential in readable form. A legacy unsealed value is returned as it is. Throws if a sealed
 *  value was altered or the key changed. */
export async function openSecret(stored: string): Promise<string> {
  if (!isSealed(stored)) return stored;
  const [ivPart, ctPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !ctPart) throw new Error("malformed sealed value");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(ivPart) }, await key(), fromB64u(ctPart));
  return new TextDecoder().decode(plain);
}
