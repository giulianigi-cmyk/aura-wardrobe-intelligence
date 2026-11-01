// «Aggiungi Nimbèa alla schermata Home»: a small card on Home, on phones only, until the person
// installs the app or taps "Got it". Nothing is installed without the person's own tap.

export type InstallPlatform = "ios" | "android" | "in-app";

/** Which instructions fit this phone; null on computers (nothing to suggest). In-app browsers
 *  (Instagram, TikTok, Facebook…) cannot add to the Home Screen: the person must open the page in
 *  Safari or Chrome first, which matters because most new visitors arrive from those links. */
export function installPlatform(userAgent: string, platform = "", maxTouchPoints = 0): InstallPlatform | null {
  if (/Instagram|FBAN|FBAV|TikTok|musical_ly|Bytedance|LinkedInApp/i.test(userAgent)) return "in-app";
  if (/iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/android/i.test(userAgent)) return "android";
  return null;
}

export function shouldShowInstallHint(input: { platform: InstallPlatform | null; standalone: boolean; dismissed: boolean }): boolean {
  return input.platform !== null && !input.standalone && !input.dismissed;
}

const key = (userId: string) => `aura.installHint.${userId}`;

export function installHintDismissed(userId: string): boolean {
  try { return localStorage.getItem(key(userId)) === "1"; } catch { return false; }
}

export function dismissInstallHint(userId: string): void {
  try { localStorage.setItem(key(userId), "1"); } catch { /* shown again next time */ }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

// Chrome on Android offers a one-tap install prompt; it fires once, early, so it is kept here.
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((l) => l()); });
}
export const installPromptEvent = () => deferred;
export function onInstallPromptChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function consumeInstallPrompt(): void { deferred = null; }
