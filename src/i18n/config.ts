import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["it", "en", "es", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Native-name labels for the language picker (Profile settings + onboarding
// step). These are intentionally NOT translated — a language switcher always
// shows each option in its own language ("Français", not "French"
// translated into whatever language is currently active), which is the
// standard pattern (Discord, Twitter/X, Duolingo, etc.).
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
};

// Initialized once at module load, isomorphically (runs on both the SSR
// pass and the client). Default language is English on first paint if
// nothing else is known yet — this matches the app's existing hardcoded
// copy and avoids a server/client hydration mismatch. Once the user's
// profile loads client-side, callers (see Home.tsx) switch i18n to
// profile.language if the user has set one.
//
// Before that profile exists at all — someone who picked a language on
// the pre-auth LanguagePicker screen (see LanguagePicker.tsx) but hasn't
// finished signing up yet — there's nothing to read a preference FROM
// except localStorage, which is why that screen writes the same key
// this reads. Without this, closing the app mid-signup and reopening it
// would silently revert to English regardless of what was chosen.
function initialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem("aura.language");
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as SupportedLanguage;
    }
  } catch { /* private browsing or similar — fall through to default */ }
  return "en";
}

// Only English (the server-render language and the fallback for any missing key) is bundled.
// Every other language is a separate chunk downloaded only when it is actually selected, so the
// startup bundle no longer carries all four translation files. Until a chunk arrives, missing
// keys fall back to English; once it is added, `bindI18nStore: "added"` re-renders every
// translated component with the right language.
const languageLoaders: Record<Exclude<SupportedLanguage, "en">, () => Promise<{ default: Record<string, unknown> }>> = {
  it: () => import("./locales/it.json"),
  es: () => import("./locales/es.json"),
  fr: () => import("./locales/fr.json"),
};

const pendingLoads = new Map<string, Promise<void>>();

/** Makes sure the translations for `lng` are loaded. Safe to call repeatedly. */
export function ensureLanguageLoaded(lng: string): Promise<void> {
  const loader = languageLoaders[lng as keyof typeof languageLoaders];
  if (!loader || i18n.hasResourceBundle(lng, "translation")) return Promise.resolve();
  let pending = pendingLoads.get(lng);
  if (!pending) {
    pending = loader()
      .then((m) => {
        i18n.addResourceBundle(lng, "translation", m.default, true, true);
      })
      .catch((err) => {
        // Network hiccup: forget the failed attempt so the next change of language retries.
        pendingLoads.delete(lng);
        console.error(`[AURA i18n] could not load "${lng}" translations`, err);
      });
    pendingLoads.set(lng, pending);
  }
  return pending;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
    },
    lng: initialLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { bindI18nStore: "added" },
  });
  // Every existing `i18n.changeLanguage(...)` call keeps working unchanged: switching to a
  // language that isn't loaded yet fetches it here.
  i18n.on("languageChanged", (lng) => { void ensureLanguageLoaded(lng); });
  void ensureLanguageLoaded(i18n.language);
}

export default i18n;
