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
export const LEGAL_VERSION = "2026-10-27.2";

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

/** Optional, separate choices (never needed to use the app), kept on the account in user_metadata.consents.
 *  marketing and partners are off until switched on; insights (anonymous statistics) is on unless the
 *  person objects. */
export type ConsentKey = "marketing" | "partners" | "insights";
export type Consents = Record<ConsentKey, boolean>;
export const CONSENT_KEYS: ConsentKey[] = ["marketing", "partners", "insights"];
export const DEFAULT_CONSENTS: Consents = { marketing: false, partners: false, insights: true };

export function consentsFrom(metadata: Record<string, unknown> | null | undefined): Consents {
  const saved = (metadata?.consents ?? {}) as Partial<Record<ConsentKey, unknown>>;
  return {
    marketing: saved.marketing === true,
    partners: saved.partners === true,
    insights: saved.insights !== false,
  };
}

type ConsentText = {
  title: string; intro: string; checkbox: string; privacy: string; terms: string; accept: string; error: string; close: string;
  optionalTitle: string; choicesTitle: string; choicesNote: string;
  /** "{terms}" and "{privacy}" are replaced by links to the two documents. */
  agreement: string; termsLink: string; privacyLink: string; marketingOptIn: string; settingsNote: string;
  options: Record<ConsentKey, { label: string; desc: string }>;
};

const CONSENT: Record<string, ConsentText> = {
  it: {
    title: "Prima di iniziare",
    agreement: "Continuando confermi di avere almeno 14 anni e accetti i {terms} e l'{privacy}.", termsLink: "Termini d'uso", privacyLink: "Informativa privacy",
    marketingOptIn: "Voglio ricevere novità e offerte di Nimbèa via email",
    settingsNote: "Le altre scelte sui dati sono in Impostazioni › Privacy, e puoi cambiarle quando vuoi.",
    intro: "Per usare Nimbèa leggi l'informativa sulla privacy e i termini d'uso.",
    checkbox: "Ho almeno 14 anni, ho letto l'informativa sulla privacy e accetto i termini d'uso.",
    privacy: "Informativa privacy", terms: "Termini d'uso", accept: "Accetta e continua",
    error: "Non è stato possibile salvare l'accettazione. Controlla la connessione e riprova.", close: "Chiudi",
    optionalTitle: "Facoltativo",
    choicesTitle: "Le tue scelte sui dati",
    choicesNote: "Sono facoltative e puoi cambiarle quando vuoi: dire di no non limita l'uso dell'app.",
    options: {
      marketing: { label: "Novità e offerte di Nimbèa via email", desc: "Nuove funzioni, consigli e offerte. Puoi disattivarlo quando vuoi." },
      partners: { label: "Offerte dei partner", desc: "Condividiamo preferenze di stile, taglie, marche e i capi che scegli con negozi e siti di rivendita selezionati, per offerte adatte a te. Mai foto del viso o del corpo, email o password." },
      insights: { label: "Statistiche anonime", desc: "I tuoi dati entrano, in forma aggregata e non riconducibile a te, nelle statistiche su marche, stili e prezzi che possiamo condividere con marchi e negozi." },
    },
  },
  en: {
    title: "Before you start",
    agreement: "By continuing you confirm you are at least 14 and accept the {terms} and the {privacy}.", termsLink: "Terms of use", privacyLink: "Privacy policy",
    marketingOptIn: "Send me Nimbèa news and offers by email",
    settingsNote: "Your other data choices are in Settings › Privacy, and you can change them at any time.",
    intro: "To use Nimbèa, please read the privacy policy and the terms of use.",
    checkbox: "I am at least 14, I have read the privacy policy and I accept the terms of use.",
    privacy: "Privacy policy", terms: "Terms of use", accept: "Accept and continue",
    error: "Your acceptance could not be saved. Check your connection and try again.", close: "Close",
    optionalTitle: "Optional",
    choicesTitle: "Your data choices",
    choicesNote: "These are optional and you can change them whenever you like: saying no does not limit your use of the app.",
    options: {
      marketing: { label: "Nimbèa news and offers by email", desc: "New features, tips and offers. You can switch it off at any time." },
      partners: { label: "Partner offers", desc: "We share style preferences, sizes, brands and the pieces you choose with selected shops and resale sites, for offers that suit you. Never face or body photos, your email or password." },
      insights: { label: "Anonymous statistics", desc: "Your data is included, aggregated and untraceable to you, in statistics on brands, styles and prices that we may share with brands and shops." },
    },
  },
  fr: {
    title: "Avant de commencer",
    agreement: "En continuant, vous confirmez avoir au moins 14 ans et acceptez les {terms} et la {privacy}.", termsLink: "conditions d'utilisation", privacyLink: "politique de confidentialité",
    marketingOptIn: "Je souhaite recevoir les nouveautés et offres de Nimbèa par e-mail",
    settingsNote: "Vos autres choix sur les données sont dans Paramètres › Confidentialité, modifiables à tout moment.",
    intro: "Pour utiliser Nimbèa, lisez la politique de confidentialité et les conditions d'utilisation (en anglais ; la version italienne fait foi).",
    checkbox: "J'ai au moins 14 ans, j'ai lu la politique de confidentialité et j'accepte les conditions d'utilisation.",
    privacy: "Confidentialité", terms: "Conditions d'utilisation", accept: "Accepter et continuer",
    error: "L'acceptation n'a pas pu être enregistrée. Vérifiez la connexion et réessayez.", close: "Fermer",
    optionalTitle: "Facultatif",
    choicesTitle: "Vos choix sur les données",
    choicesNote: "Ils sont facultatifs et modifiables à tout moment : refuser ne limite pas l'utilisation de l'app.",
    options: {
      marketing: { label: "Nouveautés et offres de Nimbèa par email", desc: "Nouvelles fonctions, conseils et offres. Vous pouvez le désactiver à tout moment." },
      partners: { label: "Offres des partenaires", desc: "Nous partageons vos préférences de style, tailles, marques et les pièces que vous choisissez avec des boutiques et sites de revente sélectionnés, pour des offres adaptées. Jamais de photos du visage ou du corps, ni d'email ou de mot de passe." },
      insights: { label: "Statistiques anonymes", desc: "Vos données sont incluses, agrégées et non identifiables, dans des statistiques sur les marques, styles et prix que nous pouvons partager avec des marques et boutiques." },
    },
  },
  es: {
    title: "Antes de empezar",
    agreement: "Al continuar confirmas que tienes al menos 14 años y aceptas los {terms} y la {privacy}.", termsLink: "Términos de uso", privacyLink: "Política de privacidad",
    marketingOptIn: "Quiero recibir novedades y ofertas de Nimbèa por email",
    settingsNote: "Tus otras opciones sobre los datos están en Ajustes › Privacidad y puedes cambiarlas cuando quieras.",
    intro: "Para usar Nimbèa, lee la política de privacidad y los términos de uso (en inglés; prevalece la versión italiana).",
    checkbox: "Tengo al menos 14 años, he leído la política de privacidad y acepto los términos de uso.",
    privacy: "Privacidad", terms: "Términos de uso", accept: "Aceptar y continuar",
    error: "No se ha podido guardar la aceptación. Revisa la conexión e inténtalo de nuevo.", close: "Cerrar",
    optionalTitle: "Opcional",
    choicesTitle: "Tus decisiones sobre los datos",
    choicesNote: "Son opcionales y puedes cambiarlas cuando quieras: decir que no no limita el uso de la app.",
    options: {
      marketing: { label: "Novedades y ofertas de Nimbèa por email", desc: "Nuevas funciones, consejos y ofertas. Puedes desactivarlo cuando quieras." },
      partners: { label: "Ofertas de socios", desc: "Compartimos preferencias de estilo, tallas, marcas y las prendas que elijas con tiendas y sitios de reventa seleccionados, para ofertas a tu medida. Nunca fotos de la cara o del cuerpo, email ni contraseña." },
      insights: { label: "Estadísticas anónimas", desc: "Tus datos se incluyen, agregados y sin poder identificarte, en estadísticas sobre marcas, estilos y precios que podemos compartir con marcas y tiendas." },
    },
  },
  zh: {
    title: "开始之前",
    agreement: "继续即表示你已年满 14 岁，并接受{terms}和{privacy}。", termsLink: "使用条款", privacyLink: "隐私政策",
    marketingOptIn: "通过电子邮件接收 Nimbèa 的新闻和优惠",
    settingsNote: "其他数据选项位于 设置 › 隐私，可随时更改。",
    intro: "使用 Nimbèa 前，请阅读隐私政策和使用条款（英文版本，以意大利文版本为准）。",
    checkbox: "我已年满 14 岁，已阅读隐私政策并接受使用条款。",
    privacy: "隐私政策", terms: "使用条款", accept: "接受并继续",
    error: "无法保存你的确认。请检查网络后重试。", close: "关闭",
    optionalTitle: "可选",
    choicesTitle: "你的数据选择",
    choicesNote: "这些都是可选的，可随时更改：拒绝不会影响你使用应用。",
    options: {
      marketing: { label: "通过邮件接收 Nimbèa 的新功能与优惠", desc: "新功能、建议和优惠。可随时关闭。" },
      partners: { label: "合作伙伴优惠", desc: "我们会把你的风格偏好、尺码、品牌和你选择的单品分享给精选的商店和二手转售网站，为你提供合适的优惠。绝不分享面部或身体照片、邮箱或密码。" },
      insights: { label: "匿名统计", desc: "你的数据会以汇总、无法识别你的形式纳入品牌、风格和价格的统计，我们可能与品牌和商店分享这些统计。" },
    },
  },
};

export function consentTextFor(language: string | undefined): ConsentText {
  return CONSENT[(language ?? "en").slice(0, 2).toLowerCase()] ?? CONSENT.en;
}
