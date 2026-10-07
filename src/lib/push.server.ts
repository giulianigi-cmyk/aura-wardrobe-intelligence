// Sending Web Push from the server. AURA's VAPID key pair is created once, the first time it is
// needed, and kept in push_vapid_keys with the private key sealed (secret-box.server.ts, the same
// server secret as the calendar credentials) — nobody has to generate or paste a key.
import { b64u, encryptPayload, vapidAuthorization, type PushTarget } from "./web-push";

const SUBJECT = "https://aura-wardrobe-intelligence.lovable.app";

type VapidKeys = { publicKey: string; privateKey: CryptoKey };
let cached: Promise<VapidKeys> | null = null;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function loadOrCreateKeys(): Promise<VapidKeys> {
  const { sealSecret, openSecret } = await import("./secret-box.server");
  const admin = await db();
  const read = async () => {
    const { data, error } = await admin.from("push_vapid_keys").select("public_key, private_key_sealed").eq("id", 1).maybeSingle();
    if (error) throw new Error(`push_vapid_keys read failed: ${error.code ?? "error"}`);
    return data as { public_key: string; private_key_sealed: string } | null;
  };
  let row = await read();
  if (!row) {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.privateKey));
    // Two servers creating it at once: the first insert wins, everyone reads that one back.
    await admin.from("push_vapid_keys").upsert({ id: 1, public_key: publicKey, private_key_sealed: await sealSecret(jwk) }, { onConflict: "id", ignoreDuplicates: true });
    row = await read();
    if (!row) throw new Error("push_vapid_keys could not be created");
  }
  const jwk = JSON.parse(await openSecret(row.private_key_sealed)) as JsonWebKey;
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { publicKey: row.public_key, privateKey };
}

export function vapidKeys(): Promise<VapidKeys> {
  if (!cached) cached = loadOrCreateKeys().catch((e) => { cached = null; throw e; });
  return cached;
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };
export type PushResult = "sent" | "gone" | "failed";

/** One notification to one subscription. "gone": the browser dropped the subscription (404/410),
 *  the caller deletes it. Nothing about the person or the message is logged. */
export async function sendPush(target: PushTarget, message: PushMessage, ttlSeconds = 4 * 3600): Promise<PushResult> {
  const keys = await vapidKeys();
  const body = await encryptPayload(target, JSON.stringify(message));
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, keys, SUBJECT),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "normal",
    },
    body,
  });
  if (res.ok) return "sent";
  if (res.status === 404 || res.status === 410) return "gone";
  console.warn("[AURA push] push service refused", res.status);
  return "failed";
}

/** Sends to every subscription of a person; drops the ones the browser no longer has. */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<{ sent: number; failed: number }> {
  const admin = await db();
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId);
  let sent = 0;
  let failed = 0;
  for (const s of (subs ?? []) as { id: number; endpoint: string; p256dh: string; auth: string; failure_count: number }[]) {
    let result: PushResult;
    try {
      result = await sendPush(s, message);
    } catch (e) {
      console.warn("[AURA push] send failed", e instanceof Error ? e.name : "error");
      result = "failed";
    }
    if (result === "sent") {
      sent++;
      await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
    } else if (result === "gone" || s.failure_count >= 9) {
      // Gone, or failing for ten sends in a row: the browser will subscribe again from Settings.
      await admin.from("push_subscriptions").delete().eq("id", s.id);
      failed++;
    } else {
      await admin.from("push_subscriptions").update({ failure_count: s.failure_count + 1 }).eq("id", s.id);
      failed++;
    }
  }
  return { sent, failed };
}
