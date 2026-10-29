// «Novità»: a new feature told once to the people who were already here when it arrived and haven't
// used it yet — in the app (a card on Home, FeatureNewsSheet) and, for someone who hasn't opened the
// app for a few days, as a push notification (morning-push.server.ts). Pure, no DB.
//
// Adding one: a line in FEATURE_NEWS (released = the day it went live) and its texts in NEWS_TEXT.

export type NewsId = "wishlist" | "compare";

export type FeatureNews = {
  id: NewsId;
  /** YYYY-MM-DD it went live: told only to accounts created before. */
  released: string;
  /** Screen the "Try it" button opens. */
  open: "shop";
  /** Guide article (Impostazioni › Guida) the "How to use it" button opens. */
  guide: string;
};

/** Newest first: the newest not-yet-used feature is told first. */
export const FEATURE_NEWS: readonly FeatureNews[] = [
  { id: "wishlist", released: "2026-10-28", open: "shop", guide: "wishlist" },
  { id: "compare", released: "2026-09-28", open: "shop", guide: "shop" },
];

export type NewsText = { title: string; body: string; pushTitle: string; pushBody: string };

export const NEWS_TEXT: Record<string, Record<NewsId, NewsText>> = {
  it: {
    wishlist: {
      title: "Novità: la Wishlist",
      body: "Salva i capi che vorresti comprare, anche incollando il link: si compila da sola. Per ognuno scegli una data o quanto mettere da parte al mese. La trovi in Home › «Completa il guardaroba».",
      pushTitle: "Novità in Nimbèa: la Wishlist",
      pushBody: "Salva i capi che vorresti e scopri quanto mettere da parte ogni mese per comprarli.",
    },
    compare: {
      title: "Novità: confronta più capi",
      body: "Non sai quale scegliere tra due o tre capi? In «Devo comprarlo?» tocca «Confronta»: Nimbèa ti dice quale si abbina meglio a quello che hai già.",
      pushTitle: "Novità in Nimbèa: confronta i capi",
      pushBody: "Non sai quale scegliere tra due capi? Nimbèa ti dice quale si abbina meglio al tuo guardaroba.",
    },
  },
  en: {
    wishlist: {
      title: "New: the Wishlist",
      body: "Save the pieces you'd like to buy, even by pasting the link: it fills in by itself. For each one choose a date or how much to set aside each month. You'll find it in Home › “Shop your gaps”.",
      pushTitle: "New in Nimbèa: the Wishlist",
      pushBody: "Save the pieces you'd like and see how much to set aside each month to buy them.",
    },
    compare: {
      title: "New: compare pieces",
      body: "Torn between two or three pieces? In “Should I buy it?” tap “Compare”: Nimbèa tells you which goes best with what you already own.",
      pushTitle: "New in Nimbèa: compare pieces",
      pushBody: "Torn between two pieces? Nimbèa tells you which goes best with your wardrobe.",
    },
  },
  fr: {
    wishlist: {
      title: "Nouveau : la liste d'envies",
      body: "Enregistrez les pièces que vous aimeriez acheter, même en collant le lien : elle se remplit toute seule. Pour chacune, choisissez une date ou combien mettre de côté par mois. Elle est dans Accueil › « Compléter votre garde-robe ».",
      pushTitle: "Nouveau dans Nimbèa : la liste d'envies",
      pushBody: "Enregistrez les pièces que vous aimeriez et voyez combien mettre de côté chaque mois.",
    },
    compare: {
      title: "Nouveau : comparer des pièces",
      body: "Vous hésitez entre deux ou trois pièces ? Dans « Devrais-je l'acheter ? », touchez « Comparer » : Nimbèa vous dit laquelle s'accorde le mieux avec ce que vous avez déjà.",
      pushTitle: "Nouveau dans Nimbèa : comparer des pièces",
      pushBody: "Vous hésitez entre deux pièces ? Nimbèa vous dit laquelle va le mieux avec votre garde-robe.",
    },
  },
  es: {
    wishlist: {
      title: "Novedad: la lista de deseos",
      body: "Guarda las prendas que te gustaría comprar, también pegando el enlace: se rellena sola. Para cada una elige una fecha o cuánto ahorrar al mes. Está en Inicio › «Completa tu armario».",
      pushTitle: "Novedad en Nimbèa: la lista de deseos",
      pushBody: "Guarda las prendas que te gustaría tener y descubre cuánto ahorrar cada mes para comprarlas.",
    },
    compare: {
      title: "Novedad: compara prendas",
      body: "¿Dudas entre dos o tres prendas? En «¿Debería comprarlo?» toca «Comparar»: Nimbèa te dice cuál combina mejor con lo que ya tienes.",
      pushTitle: "Novedad en Nimbèa: compara prendas",
      pushBody: "¿Dudas entre dos prendas? Nimbèa te dice cuál combina mejor con tu armario.",
    },
  },
  zh: {
    wishlist: {
      title: "新功能：心愿单",
      body: "保存想买的单品，粘贴链接即可自动填写。为每件选择日期或每月存多少。在首页 ›“补齐衣橱空缺”中找到它。",
      pushTitle: "Nimbèa 新功能：心愿单",
      pushBody: "保存想要的单品，看看每月该存多少钱来买它们。",
    },
    compare: {
      title: "新功能：比较单品",
      body: "在两三件单品之间犹豫？在“我该买吗？”中点按“比较”：Nimbèa 会告诉你哪件和你已有的衣物最搭。",
      pushTitle: "Nimbèa 新功能：比较单品",
      pushBody: "在两件单品之间犹豫？Nimbèa 会告诉你哪件最适合你的衣橱。",
    },
  },
};

export function newsText(language: string | null | undefined, id: NewsId): NewsText {
  const lang = (language ?? "en").slice(0, 2).toLowerCase();
  return (NEWS_TEXT[lang] ?? NEWS_TEXT.en)[id];
}

/** The news to tell this person now: released after they signed up, not used, not told yet. */
export function nextNews(opts: { signedUpAt: string | null | undefined; told: ReadonlySet<string>; used: ReadonlySet<string> }): FeatureNews | null {
  const signed = (opts.signedUpAt ?? "").slice(0, 10);
  return FEATURE_NEWS.find((n) => signed !== "" && signed < n.released && !opts.told.has(n.id) && !opts.used.has(n.id)) ?? null;
}

/** Push rules: at most one news notification a week, and only to someone away from the app for a few days. */
export const NEWS_PUSH_GAP_DAYS = 7;
export const NEWS_PUSH_AWAY_DAYS = 3;
export const NEWS_PUSH_TIME = "18:30";

export function newsPushAllowed(opts: { lastNewsPush: string | null; lastOpen: string | null; today: string; now: Date }): boolean {
  const day = 86_400_000;
  if (opts.lastNewsPush) {
    const since = (Date.parse(`${opts.today}T00:00:00Z`) - Date.parse(`${opts.lastNewsPush.slice(0, 10)}T00:00:00Z`)) / day;
    if (since < NEWS_PUSH_GAP_DAYS) return false;
  }
  if (opts.lastOpen && opts.now.getTime() - Date.parse(opts.lastOpen) < NEWS_PUSH_AWAY_DAYS * day) return false;
  return true;
}
