// «Vuoi ricevere le notifiche?» — asked at two good moments: after a piece is added to the wardrobe
// and after an outfit is saved, once each per device (the push subscription is per device). Turning
// them on stays an explicit choice: "Not now" and "Turn on" have the same weight. On iPhone, without
// the app on the Home Screen, it explains how to add it instead (notifications cannot work there).

import type { PushAvailability } from "./push-client";

export const PUSH_ASK_EVENT = "aura:ask-push";
export type PushAskMoment = "piece" | "outfit";
export const PUSH_ASK_MOMENTS: readonly PushAskMoment[] = ["piece", "outfit"];
const askedKey = (userId: string) => `aura.pushAsked.${userId}`;

/** Ask (if this device has no notifications yet and this moment was not asked before). */
export function askPush(moment: PushAskMoment): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<PushAskMoment>(PUSH_ASK_EVENT, { detail: moment }));
}

export function askedMoments(userId: string): Set<PushAskMoment> {
  try {
    const raw = JSON.parse(localStorage.getItem(askedKey(userId)) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((m): m is PushAskMoment => PUSH_ASK_MOMENTS.includes(m)));
  } catch {
    return new Set();
  }
}

export function markAsked(userId: string, moment: PushAskMoment): void {
  try {
    const next = askedMoments(userId);
    next.add(moment);
    localStorage.setItem(askedKey(userId), JSON.stringify([...next]));
  } catch { /* asked again next time */ }
}

/** Whether to show the question now. Blocked or unsupported devices are never asked: nothing can
 *  be turned on from a tap there. */
export function pushAskAllowed(input: { availability: PushAvailability; deviceOn: boolean; asked: Set<PushAskMoment>; moment: PushAskMoment }): boolean {
  if (input.asked.has(input.moment) || input.deviceOn) return false;
  return input.availability === "ready" || input.availability === "needs-install";
}
