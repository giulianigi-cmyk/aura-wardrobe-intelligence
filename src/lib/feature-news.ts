// «Novità»: a feature told once to the people who haven't used it yet — in the app (a card on Home, FeatureNewsSheet) and, for someone who hasn't opened the
// app for a few days, as a push notification (morning-push.server.ts). Pure, no DB.
//
// Adding one: a line in FEATURE_NEWS (released = the day it went live) and its texts in NEWS_TEXT.

export type NewsId = "wishlist" | "compare" | "basket" | "storage" | "sell" | "trips" | "calendar" | "locations" | "tryon";

/** Screens a «Novità» can open (also reachable from a notification: "/?open=<screen>"). */
export type NewsScreen = "shop" | "wardrobe" | "trips" | "settings-calendar" | "settings-wardrobe-locations" | "avatar-tryon";
export const NEWS_SCREENS: readonly NewsScreen[] = ["shop", "wardrobe", "trips", "settings-calendar", "settings-wardrobe-locations", "avatar-tryon"];

export type FeatureNews = {
  id: NewsId;
  /** YYYY-MM-DD it went live (order only: the newest is told first). */
  released: string;
  /** Screen the "Try it" button opens. */
  open: NewsScreen;
  /** Guide article (Impostazioni › Guida) the "How to use it" button opens. */
  guide: string;
};

/** Newest first: the newest not-yet-used feature is told first. */
export const FEATURE_NEWS: readonly FeatureNews[] = [
  { id: "wishlist", released: "2026-10-28", open: "shop", guide: "wishlist" },
  { id: "basket", released: "2026-10-28", open: "wardrobe", guide: "basket" },
  { id: "sell", released: "2026-10-28", open: "wardrobe", guide: "sell" },
  { id: "storage", released: "2026-10-26", open: "wardrobe", guide: "storage" },
  { id: "compare", released: "2026-09-28", open: "shop", guide: "shop" },
  { id: "trips", released: "2026-09-28", open: "trips", guide: "trips" },
  { id: "calendar", released: "2026-09-28", open: "settings-calendar", guide: "connect-calendar" },
  { id: "locations", released: "2026-09-28", open: "settings-wardrobe-locations", guide: "locations" },
  { id: "tryon", released: "2026-09-28", open: "avatar-tryon", guide: "try-on" },
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
    basket: {
      title: "Novità: il cesto del bucato",
      body: "Metti nel cesto i capi da lavare (e segna quelli in tintoria o prestati): non escono nei look finché non tornano nell'armadio. Li trovi in Guardaroba › «Non disponibili».",
      pushTitle: "Novità in Nimbèa: il cesto del bucato",
      pushBody: "I capi da lavare non escono più nei look finché non tornano nell'armadio.",
    },
    storage: {
      title: "Novità: il cambio stagione",
      body: "Sposta i capi fuori stagione nel cambio stagione: restano tuoi ma non vengono proposti finché non li riprendi. In Guardaroba › «Seleziona» › «Cambio stagione».",
      pushTitle: "Novità in Nimbèa: il cambio stagione",
      pushBody: "Metti via i capi fuori stagione e Nimbèa ti propone solo quelli che hai a portata di mano.",
    },
    sell: {
      title: "Novità: vendi un capo",
      body: "Da un capo che non metti più: «Opzioni» › «Vendi questo capo». Nimbèa prepara annuncio, prezzo suggerito e foto senza sfondo da copiare sul sito che preferisci.",
      pushTitle: "Novità in Nimbèa: vendi i capi che non metti",
      pushBody: "Annuncio, prezzo e foto pronti in un attimo per i capi che non metti più.",
    },
    trips: {
      title: "Novità: i viaggi",
      body: "In Calendario › «Viaggi» scrivi destinazione e date: Nimbèa prepara la valigia e gli outfit per ogni giorno, in base al meteo.",
      pushTitle: "Novità in Nimbèa: la valigia pronta",
      pushBody: "Scrivi dove vai e quando: Nimbèa prepara valigia e outfit in base al meteo.",
    },
    calendar: {
      title: "Novità: collega il calendario",
      body: "Collega Google, Outlook o iCloud: Nimbèa ti propone l'outfit giusto per ogni appuntamento.",
      pushTitle: "Novità in Nimbèa: outfit per i tuoi impegni",
      pushBody: "Collega il calendario e ricevi l'outfit giusto per ogni appuntamento.",
    },
    locations: {
      title: "Novità: più guardaroba",
      body: "Tieni i vestiti in posti diversi (casa, mare, città)? Crea i tuoi luoghi e Nimbèa ti propone solo quello che hai a portata di mano.",
      pushTitle: "Novità in Nimbèa: più guardaroba",
      pushBody: "Casa, mare, città: Nimbèa ti propone solo i capi che hai lì.",
    },
    tryon: {
      title: "Novità: prova gli outfit sull'avatar",
      body: "Crea il tuo avatar e prova gli outfit addosso prima di vestirti.",
      pushTitle: "Novità in Nimbèa: prova gli outfit",
      pushBody: "Vedi come ti sta un outfit sul tuo avatar prima di indossarlo.",
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
    basket: {
      title: "New: the laundry basket",
      body: "Put the pieces to wash in the basket (and mark those at the dry cleaner or lent): they stay out of your looks until they're back in the wardrobe. Find them in Closet › “Unavailable”.",
      pushTitle: "New in Nimbèa: the laundry basket",
      pushBody: "Pieces in the wash stay out of your looks until they're back in the wardrobe.",
    },
    storage: {
      title: "New: seasonal storage",
      body: "Move out-of-season pieces to seasonal storage: they stay yours but aren't suggested until you bring them back. In Closet › “Select” › “Seasonal storage”.",
      pushTitle: "New in Nimbèa: seasonal storage",
      pushBody: "Put away out-of-season pieces and Nimbèa suggests only what's at hand.",
    },
    sell: {
      title: "New: sell a piece",
      body: "From a piece you no longer wear: “Options” › “Sell this piece”. Nimbèa prepares the listing, a suggested price and a cut-out photo to paste on the site you like.",
      pushTitle: "New in Nimbèa: sell what you don't wear",
      pushBody: "Listing, price and photo ready in a moment for the pieces you no longer wear.",
    },
    trips: {
      title: "New: trips",
      body: "In Calendar › “Trips” enter destination and dates: Nimbèa packs the suitcase and the outfits for each day, based on the forecast.",
      pushTitle: "New in Nimbèa: your suitcase, ready",
      pushBody: "Say where and when: Nimbèa packs the suitcase and outfits for the weather.",
    },
    calendar: {
      title: "New: connect your calendar",
      body: "Connect Google, Outlook or iCloud: Nimbèa suggests the right outfit for each appointment.",
      pushTitle: "New in Nimbèa: outfits for your plans",
      pushBody: "Connect your calendar and get the right outfit for each appointment.",
    },
    locations: {
      title: "New: several wardrobes",
      body: "Keep clothes in different places (home, seaside, city)? Create your places and Nimbèa suggests only what's at hand.",
      pushTitle: "New in Nimbèa: several wardrobes",
      pushBody: "Home, seaside, city: Nimbèa suggests only the pieces you have there.",
    },
    tryon: {
      title: "New: try outfits on your avatar",
      body: "Create your avatar and try outfits on before you get dressed.",
      pushTitle: "New in Nimbèa: try outfits on",
      pushBody: "See how an outfit looks on your avatar before you wear it.",
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
    basket: {
      title: "Nouveau : le panier à linge",
      body: "Mettez dans le panier les pièces à laver (et indiquez celles au pressing ou prêtées) : elles ne sortent pas dans les looks tant qu'elles ne sont pas revenues. Dans Garde-robe › « Indisponibles ».",
      pushTitle: "Nouveau dans Nimbèa : le panier à linge",
      pushBody: "Les pièces au lavage ne sortent plus dans les looks tant qu'elles ne sont pas revenues.",
    },
    storage: {
      title: "Nouveau : le rangement de saison",
      body: "Rangez les pièces hors saison : elles restent à vous mais ne sont pas proposées tant que vous ne les reprenez pas. Dans Garde-robe › « Sélectionner » › « Rangement saisonnier ».",
      pushTitle: "Nouveau dans Nimbèa : le rangement de saison",
      pushBody: "Rangez les pièces hors saison et Nimbèa ne propose que celles à portée de main.",
    },
    sell: {
      title: "Nouveau : vendre une pièce",
      body: "Depuis une pièce que vous ne portez plus : « Options » › « Vendre cette pièce ». Nimbèa prépare l'annonce, un prix conseillé et la photo détourée à coller sur le site de votre choix.",
      pushTitle: "Nouveau dans Nimbèa : vendez ce que vous ne portez pas",
      pushBody: "Annonce, prix et photo prêts en un instant pour les pièces que vous ne portez plus.",
    },
    trips: {
      title: "Nouveau : les voyages",
      body: "Dans Calendrier › « Voyages », indiquez destination et dates : Nimbèa prépare la valise et les tenues de chaque jour selon la météo.",
      pushTitle: "Nouveau dans Nimbèa : la valise prête",
      pushBody: "Dites où et quand : Nimbèa prépare valise et tenues selon la météo.",
    },
    calendar: {
      title: "Nouveau : connectez votre agenda",
      body: "Connectez Google, Outlook ou iCloud : Nimbèa propose la bonne tenue pour chaque rendez-vous.",
      pushTitle: "Nouveau dans Nimbèa : des tenues pour vos rendez-vous",
      pushBody: "Connectez votre agenda et recevez la bonne tenue pour chaque rendez-vous.",
    },
    locations: {
      title: "Nouveau : plusieurs garde-robes",
      body: "Vos vêtements sont à plusieurs endroits (maison, mer, ville) ? Créez vos lieux et Nimbèa ne propose que ce que vous avez à portée de main.",
      pushTitle: "Nouveau dans Nimbèa : plusieurs garde-robes",
      pushBody: "Maison, mer, ville : Nimbèa ne propose que les pièces que vous avez là-bas.",
    },
    tryon: {
      title: "Nouveau : essayez les tenues sur votre avatar",
      body: "Créez votre avatar et essayez les tenues avant de vous habiller.",
      pushTitle: "Nouveau dans Nimbèa : essayez les tenues",
      pushBody: "Voyez une tenue sur votre avatar avant de la porter.",
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
    basket: {
      title: "Novedad: el cesto de la ropa",
      body: "Pon en el cesto las prendas para lavar (y marca las de la tintorería o prestadas): no salen en los looks hasta que vuelven al armario. En Armario › «No disponibles».",
      pushTitle: "Novedad en Nimbèa: el cesto de la ropa",
      pushBody: "Las prendas para lavar ya no salen en los looks hasta que vuelven al armario.",
    },
    storage: {
      title: "Novedad: el cambio de temporada",
      body: "Guarda las prendas fuera de temporada: siguen siendo tuyas pero no se proponen hasta que las recuperas. En Armario › «Seleccionar» › «Cambio de armario».",
      pushTitle: "Novedad en Nimbèa: el cambio de temporada",
      pushBody: "Guarda las prendas fuera de temporada y Nimbèa te propone solo las que tienes a mano.",
    },
    sell: {
      title: "Novedad: vende una prenda",
      body: "Desde una prenda que ya no usas: «Opciones» › «Vender esta prenda». Nimbèa prepara el anuncio, un precio sugerido y la foto sin fondo para pegar en la web que prefieras.",
      pushTitle: "Novedad en Nimbèa: vende lo que no usas",
      pushBody: "Anuncio, precio y foto listos en un momento para las prendas que ya no usas.",
    },
    trips: {
      title: "Novedad: los viajes",
      body: "En Calendario › «Viajes» escribe destino y fechas: Nimbèa prepara la maleta y los looks de cada día según el tiempo.",
      pushTitle: "Novedad en Nimbèa: la maleta lista",
      pushBody: "Di adónde y cuándo: Nimbèa prepara maleta y looks según el tiempo.",
    },
    calendar: {
      title: "Novedad: conecta tu calendario",
      body: "Conecta Google, Outlook o iCloud: Nimbèa te propone el look adecuado para cada cita.",
      pushTitle: "Novedad en Nimbèa: looks para tus planes",
      pushBody: "Conecta tu calendario y recibe el look adecuado para cada cita.",
    },
    locations: {
      title: "Novedad: varios armarios",
      body: "¿Tienes ropa en sitios distintos (casa, playa, ciudad)? Crea tus lugares y Nimbèa te propone solo lo que tienes a mano.",
      pushTitle: "Novedad en Nimbèa: varios armarios",
      pushBody: "Casa, playa, ciudad: Nimbèa te propone solo las prendas que tienes allí.",
    },
    tryon: {
      title: "Novedad: prueba los looks en tu avatar",
      body: "Crea tu avatar y prueba los looks antes de vestirte.",
      pushTitle: "Novedad en Nimbèa: prueba los looks",
      pushBody: "Mira cómo te queda un look en tu avatar antes de ponértelo.",
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
    basket: {
      title: "新功能：洗衣篮",
      body: "把要洗的单品放进洗衣篮（也可标记送洗或借出的单品）：它们回到衣橱前不会出现在搭配中。在衣橱 ›“暂不可用”中查看。",
      pushTitle: "Nimbèa 新功能：洗衣篮",
      pushBody: "要洗的单品回到衣橱前不会再出现在搭配中。",
    },
    storage: {
      title: "新功能：换季收纳",
      body: "把过季单品收起来：它们仍属于你，但在你取回之前不会被推荐。在衣橱 ›“选择”›“换季收纳”。",
      pushTitle: "Nimbèa 新功能：换季收纳",
      pushBody: "收起过季单品，Nimbèa 只推荐手边的衣物。",
    },
    sell: {
      title: "新功能：出售单品",
      body: "在不再穿的单品上：“选项”›“出售这件单品”。Nimbèa 会准备好文案、建议价格和去背景照片，复制到你喜欢的网站即可。",
      pushTitle: "Nimbèa 新功能：出售不穿的单品",
      pushBody: "为不再穿的单品一键准备好文案、价格和照片。",
    },
    trips: {
      title: "新功能：旅行",
      body: "在日历 ›“旅行”中填写目的地和日期：Nimbèa 会根据天气准备行李和每天的搭配。",
      pushTitle: "Nimbèa 新功能：行李已备好",
      pushBody: "告诉我们去哪里、什么时候：Nimbèa 根据天气准备行李和搭配。",
    },
    calendar: {
      title: "新功能：连接日历",
      body: "连接 Google、Outlook 或 iCloud：Nimbèa 为每个约会推荐合适的搭配。",
      pushTitle: "Nimbèa 新功能：为你的日程搭配",
      pushBody: "连接日历，为每个约会获得合适的搭配。",
    },
    locations: {
      title: "新功能：多个衣橱",
      body: "衣服放在不同地方（家里、海边、城里）？创建你的地点，Nimbèa 只推荐手边的衣物。",
      pushTitle: "Nimbèa 新功能：多个衣橱",
      pushBody: "家里、海边、城里：Nimbèa 只推荐你在那里的单品。",
    },
    tryon: {
      title: "新功能：在虚拟形象上试穿",
      body: "创建你的虚拟形象，在穿衣前试穿搭配。",
      pushTitle: "Nimbèa 新功能：试穿搭配",
      pushBody: "穿之前先在虚拟形象上看看效果。",
    },
  },
};

export function newsText(language: string | null | undefined, id: NewsId): NewsText {
  const lang = (language ?? "en").slice(0, 2).toLowerCase();
  return (NEWS_TEXT[lang] ?? NEWS_TEXT.en)[id];
}

/** At most one «Novità» card every few days, and none in the first days after signing up (the tour
 *  comes first). */
export const NEWS_CARD_GAP_DAYS = 3;
export const NEWS_NEW_ACCOUNT_DAYS = 3;

/** The news to tell this person now: the newest feature not used and not told yet. */
export function nextNews(opts: { told: ReadonlySet<string>; used: ReadonlySet<string> }): FeatureNews | null {
  return FEATURE_NEWS.find((n) => !opts.told.has(n.id) && !opts.used.has(n.id)) ?? null;
}

/** Whether a card may be shown now (account old enough, last card long enough ago). */
export function newsCardAllowed(opts: { signedUpAt: string | null | undefined; lastShown: string | null | undefined; now: Date }): boolean {
  const day = 86_400_000;
  const signed = Date.parse(opts.signedUpAt ?? "");
  if (!Number.isFinite(signed) || opts.now.getTime() - signed < NEWS_NEW_ACCOUNT_DAYS * day) return false;
  const last = Date.parse(opts.lastShown ?? "");
  return !Number.isFinite(last) || opts.now.getTime() - last >= NEWS_CARD_GAP_DAYS * day;
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
