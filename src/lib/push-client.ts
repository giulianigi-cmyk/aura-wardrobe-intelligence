// This device and push notifications: whether it can receive them, turning them on (permission,
// service worker, subscription saved on the server) and off. On iPhone and iPad, web notifications
// only work once AURA is added to the Home Screen (iOS 16.4 or later).
import { deletePushSubscription, getPushPublicKey, savePushSubscription } from "./push.functions";
import { fromB64u } from "./web-push";
import { telemetryPlatform } from "./telemetry-client";

export type PushAvailability = "ready" | "needs-install" | "unsupported" | "denied";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function pushAvailability(): PushAvailability {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** This device's current subscription, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushAvailability() !== "ready") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission (must follow a tap) and saves this device. Returns the outcome. */
export async function enablePush(): Promise<"ok" | "denied" | "failed"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await getPushPublicKey();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "failed";
    const res = await savePushSubscription({ data: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, platform: telemetryPlatform() } });
    return res.ok ? "ok" : "failed";
  } catch (e) {
    console.warn("[AURA push] enabling failed", e instanceof Error ? e.name : "error");
    return "failed";
  }
}

/** Stops notifications on this device. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  try { await deletePushSubscription({ data: { endpoint: sub.endpoint } }); } catch { /* removed on the next failed send anyway */ }
  try { await sub.unsubscribe(); } catch { /* already gone */ }
}
