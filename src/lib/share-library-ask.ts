// «Vuoi condividere anche i tuoi capi?» — asked right after a piece is added to the wardrobe, most of
// all when it came from the library (someone shared it), the moment its value is plainest. Sharing
// stays an explicit choice (consent): Yes and Not now have the same weight, and after "Not now" it is
// not asked again for 30 days.

export const SHARE_ASK_EVENT = "aura:ask-share-library";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const snoozeKey = (userId: string) => `aura.shareLibraryAskSnooze.${userId}`;

export type ShareAskKind = "found" | "added";

// Whether the question is on screen: another question (notifications) waits for its turn.
let open = false;
export const isShareAskOpen = () => open;
export const setShareAskOpen = (value: boolean) => { open = value; };

/** Ask (if the person does not share yet and did not say "Not now" lately). "found": the piece came
 *  from the library; "added": any other piece. */
export function askShareLibrary(kind: ShareAskKind): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ShareAskKind>(SHARE_ASK_EVENT, { detail: kind }));
}

export function snoozedRecently(userId: string, now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(snoozeKey(userId)) ?? 0);
    return at > 0 && now - at < SNOOZE_MS && at <= now;
  } catch {
    return false;
  }
}

export function snoozeShareAsk(userId: string, now = Date.now()): void {
  try { localStorage.setItem(snoozeKey(userId), String(now)); } catch { /* asked again next time */ }
}
