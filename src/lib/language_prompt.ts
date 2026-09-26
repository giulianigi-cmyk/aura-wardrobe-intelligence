// Shared by every outfit-generation engine that writes its own free-text explanation but has no
// conversation to infer a language from (unlike stylist-chat.functions.ts, which reads the
// person's own message text) — Home's daily/curated looks, the on-demand/weekly generator, and
// the trip capsule. Without an explicit instruction, the model defaults to English regardless of
// the app's own selected language, which is what made every "Selezionati per te" explanation on
// Home come out in English even for a person using the app in Italian.

const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italian",
  en: "English",
  es: "Spanish",
  fr: "French",
};

/** A system-prompt line asking the model to write its free-text explanation/reply in the given
 *  app language — or an empty string when the language is English, unset, or unrecognized (no
 *  instruction needed; English is the model's own natural default). `language` is the app's own
 *  stored preference (profiles.language — "it" | "en" | "es" | "fr"), not inferred from anything
 *  in the wardrobe data itself. */
export function explanationLanguageInstruction(language: string | null | undefined): string {
  const name = language ? LANGUAGE_NAMES[language] : null;
  if (!name || name === "English") return "";
  return `Write the "explanation" field in ${name}, not English — this is the app's own selected language, independent of what language any wardrobe data (brand names, colors) happens to be in.`;
}
