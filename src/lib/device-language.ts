// The app's language on first launch, without asking: the phone's own languages in order, the first
// one Nimbèa speaks; on nimbea.it Italian when none matches, elsewhere English. Chosen once and kept
// on the device (same keys as the language picker); it can be changed from the onboarding corner
// and later in Settings.
import i18n, { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n/config";

export function deviceLanguage(languages: readonly string[], host = ""): SupportedLanguage {
  for (const l of languages) {
    const base = l.toLowerCase().slice(0, 2);
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(base)) return base as SupportedLanguage;
  }
  return /\.it$/i.test(host) ? "it" : "en";
}

/** Saves and applies a language for this device (also the onboarding's language switch). */
export function setDeviceLanguage(code: SupportedLanguage): void {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem("aura.language", code);
    localStorage.setItem("aura.language_chosen", "1");
  } catch { /* private browsing: the in-memory change still applies for this session */ }
}

/** First launch: the phone's language, unless one was already chosen on this device. */
export function applyDeviceLanguageOnce(): void {
  if (typeof window === "undefined") return;
  try { if (localStorage.getItem("aura.language_chosen") === "1") return; } catch { /* fall through */ }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
  setDeviceLanguage(deviceLanguage(langs, window.location.hostname));
}
