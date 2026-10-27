import privacyIt from "./privacy.it.md?raw";
import privacyEn from "./privacy.en.md?raw";
import termsIt from "./terms.it.md?raw";
import termsEn from "./terms.en.md?raw";

/**
 * Privacy policy and terms of use shown in the app (provisional, pending legal review). Italian is the
 * authoritative text; every other language gets the English translation.
 *
 * LEGAL_VERSION is what each account accepts (stored in its auth user_metadata with the date). Raising
 * it after an important change makes everyone accept the new documents again before going on.
 */
export const LEGAL_VERSION = "2026-10-27";

export type LegalDoc = "privacy" | "terms";

export function legalDocText(doc: LegalDoc, language: string | undefined): string {
  const it = (language ?? "").slice(0, 2).toLowerCase() === "it";
  if (doc === "privacy") return it ? privacyIt : privacyEn;
  return it ? termsIt : termsEn;
}

/** Whether this account has accepted the current documents. */
export function hasAcceptedLegal(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.legal_version === LEGAL_VERSION;
}

type ConsentText = {
  title: string; intro: string; checkbox: string; privacy: string; terms: string; accept: string; error: string; close: string;
};

const CONSENT: Record<string, ConsentText> = {
  it: {
    title: "Prima di iniziare",
    intro: "Per usare Nimbèa leggi l'informativa sulla privacy e i termini d'uso.",
    checkbox: "Ho almeno 14 anni, ho letto l'informativa sulla privacy e accetto i termini d'uso.",
    privacy: "Informativa privacy", terms: "Termini d'uso", accept: "Accetta e continua",
    error: "Non è stato possibile salvare l'accettazione. Controlla la connessione e riprova.", close: "Chiudi",
  },
  en: {
    title: "Before you start",
    intro: "To use Nimbèa, please read the privacy policy and the terms of use.",
    checkbox: "I am at least 14, I have read the privacy policy and I accept the terms of use.",
    privacy: "Privacy policy", terms: "Terms of use", accept: "Accept and continue",
    error: "Your acceptance could not be saved. Check your connection and try again.", close: "Close",
  },
  fr: {
    title: "Avant de commencer",
    intro: "Pour utiliser Nimbèa, lisez la politique de confidentialité et les conditions d'utilisation (en anglais ; la version italienne fait foi).",
    checkbox: "J'ai au moins 14 ans, j'ai lu la politique de confidentialité et j'accepte les conditions d'utilisation.",
    privacy: "Confidentialité", terms: "Conditions d'utilisation", accept: "Accepter et continuer",
    error: "L'acceptation n'a pas pu être enregistrée. Vérifiez la connexion et réessayez.", close: "Fermer",
  },
  es: {
    title: "Antes de empezar",
    intro: "Para usar Nimbèa, lee la política de privacidad y los términos de uso (en inglés; prevalece la versión italiana).",
    checkbox: "Tengo al menos 14 años, he leído la política de privacidad y acepto los términos de uso.",
    privacy: "Privacidad", terms: "Términos de uso", accept: "Aceptar y continuar",
    error: "No se ha podido guardar la aceptación. Revisa la conexión e inténtalo de nuevo.", close: "Cerrar",
  },
  zh: {
    title: "开始之前",
    intro: "使用 Nimbèa 前，请阅读隐私政策和使用条款（英文版本，以意大利文版本为准）。",
    checkbox: "我已年满 14 岁，已阅读隐私政策并接受使用条款。",
    privacy: "隐私政策", terms: "使用条款", accept: "接受并继续",
    error: "无法保存你的确认。请检查网络后重试。", close: "关闭",
  },
};

export function consentTextFor(language: string | undefined): ConsentText {
  return CONSENT[(language ?? "en").slice(0, 2).toLowerCase()] ?? CONSENT.en;
}
