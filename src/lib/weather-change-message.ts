// Text of the "weather changed for your planned outfit" notification, in the person's language
// (it, en, es, fr; anything else falls back to English). It used to be English for everyone.
// Pieces are named by kind + brand ("borsa Uniqlo"): the stored colour and subcategory names are
// English ("Pure White", "Pumps") and read as half-translated inside an Italian sentence.

type Lang = "it" | "en" | "es" | "fr";
const LOCALE: Record<Lang, string> = { it: "it-IT", en: "en-US", es: "es-ES", fr: "fr-FR" };

const KIND: Record<Lang, Record<string, string>> = {
  it: { Tops: "top", Bottoms: "pantaloni", Dresses: "abito", Jumpsuits: "tuta", Outerwear: "capospalla", Shoes: "scarpe", Bags: "borsa", Accessories: "accessorio", Activewear: "capo sportivo", Swimwear: "costume" },
  en: { Tops: "top", Bottoms: "bottoms", Dresses: "dress", Jumpsuits: "jumpsuit", Outerwear: "jacket", Shoes: "shoes", Bags: "bag", Accessories: "accessory", Activewear: "activewear", Swimwear: "swimwear" },
  es: { Tops: "top", Bottoms: "pantalón", Dresses: "vestido", Jumpsuits: "mono", Outerwear: "abrigo", Shoes: "zapatos", Bags: "bolso", Accessories: "accesorio", Activewear: "ropa deportiva", Swimwear: "bañador" },
  fr: { Tops: "haut", Bottoms: "bas", Dresses: "robe", Jumpsuits: "combinaison", Outerwear: "veste", Shoes: "chaussures", Bags: "sac", Accessories: "accessoire", Activewear: "tenue de sport", Swimwear: "maillot" },
};

const WEATHER: Record<Lang, Record<string, string>> = {
  it: { clear: "Sereno", mostlyClear: "Poco nuvoloso", partlyCloudy: "Parzialmente nuvoloso", overcast: "Coperto", fog: "Nebbia", drizzle: "Pioviggine", rain: "Pioggia", snow: "Neve", showers: "Rovesci", snowShowers: "Rovesci di neve", thunderstorm: "Temporale", unknown: "Tempo variabile" },
  en: { clear: "Clear skies", mostlyClear: "Mostly clear", partlyCloudy: "Partly cloudy", overcast: "Overcast", fog: "Fog", drizzle: "Drizzle", rain: "Rain", snow: "Snow", showers: "Showers", snowShowers: "Snow showers", thunderstorm: "Thunderstorms", unknown: "Changeable weather" },
  es: { clear: "Despejado", mostlyClear: "Poco nuboso", partlyCloudy: "Parcialmente nuboso", overcast: "Cubierto", fog: "Niebla", drizzle: "Llovizna", rain: "Lluvia", snow: "Nieve", showers: "Chubascos", snowShowers: "Chubascos de nieve", thunderstorm: "Tormenta", unknown: "Tiempo variable" },
  fr: { clear: "Ciel dégagé", mostlyClear: "Peu nuageux", partlyCloudy: "Partiellement nuageux", overcast: "Couvert", fog: "Brouillard", drizzle: "Bruine", rain: "Pluie", snow: "Neige", showers: "Averses", snowShowers: "Averses de neige", thunderstorm: "Orage", unknown: "Temps variable" },
};

const TEXT: Record<Lang, {
  title: (weekday: string) => string;
  dropped: (cond: string, pieces: string) => string;
  added: (pieces: string) => string;
  general: (cond: string, temp: number) => string;
  umbrella: (chance: number) => string;
  and: string;
}> = {
  it: {
    title: (d) => `Il meteo è cambiato per l'outfit di ${d}`,
    dropped: (c, p) => `${c} in arrivo: ${p} potrebbero non essere la scelta migliore.`,
    added: (p) => `Ti suggerisco invece: ${p}.`,
    general: (c, t) => `${c}, intorno ai ${t}°.`,
    umbrella: (n) => `${n}% di probabilità di pioggia: non dimenticare l'ombrello.`,
    and: " e ",
  },
  en: {
    title: (d) => `Weather changed for your ${d} outfit`,
    dropped: (c, p) => `${c} expected — your ${p} may not be ideal.`,
    added: (p) => `Suggested instead: ${p}.`,
    general: (c, t) => `${c} expected, around ${t}°.`,
    umbrella: (n) => `${n}% chance of rain — don't forget your umbrella.`,
    and: " and ",
  },
  es: {
    title: (d) => `El tiempo ha cambiado para tu outfit del ${d}`,
    dropped: (c, p) => `Se esperan ${c.toLowerCase()}: ${p} quizá no sea lo más adecuado.`,
    added: (p) => `Te sugiero en su lugar: ${p}.`,
    general: (c, t) => `${c}, alrededor de ${t}°.`,
    umbrella: (n) => `${n}% de probabilidad de lluvia: no olvides el paraguas.`,
    and: " y ",
  },
  fr: {
    title: (d) => `La météo a changé pour ta tenue de ${d}`,
    dropped: (c, p) => `${c} prévu(e)s : ${p} ne sont peut-être pas l'idéal.`,
    added: (p) => `Je te suggère plutôt : ${p}.`,
    general: (c, t) => `${c}, autour de ${t}°.`,
    umbrella: (n) => `${n} % de risque de pluie : n'oublie pas ton parapluie.`,
    and: " et ",
  },
};

export function langOf(language: string | null | undefined): Lang {
  const l = (language ?? "").slice(0, 2).toLowerCase();
  return (l === "it" || l === "es" || l === "fr" ? l : "en") as Lang;
}

/** "borsa Uniqlo", "scarpe Le Silla": the piece's kind in the person's language plus its brand. */
export function pieceLabel(language: string | null | undefined, item: { category?: string | null; brand?: string | null } | undefined): string | null {
  if (!item) return null;
  const kind = KIND[langOf(language)][item.category ?? ""] ?? null;
  const brand = (item.brand ?? "").trim();
  const label = [kind, brand].filter(Boolean).join(" ");
  return label || null;
}

/** Weather label in the person's language, from the same key weatherLabelKey() returns ("weather.rain"). */
export function weatherWord(language: string | null | undefined, labelKey: string): string {
  const w = WEATHER[langOf(language)];
  return w[labelKey.replace(/^weather\./, "")] ?? w.unknown;
}

export function weatherChangeMessage(language: string | null | undefined, a: {
  dateIso: string; weatherKey: string; tempMax: number; precipitation: number; umbrellaThreshold: number;
  dropped: string[]; added: string[]; explanation?: string | null;
}): { title: string; body: string } {
  const lang = langOf(language);
  const t = TEXT[lang];
  const weekday = new Date(`${a.dateIso}T00:00:00Z`).toLocaleDateString(LOCALE[lang], { weekday: "long", timeZone: "UTC" });
  const cond = weatherWord(lang, a.weatherKey);
  const lines: string[] = [];
  if (a.dropped.length) {
    lines.push(t.dropped(cond, a.dropped.slice(0, 2).join(t.and)));
    if (a.added.length) lines.push(t.added(a.added.slice(0, 2).join(t.and)));
  } else {
    lines.push(t.general(cond, Math.round(a.tempMax)));
  }
  if (a.precipitation > a.umbrellaThreshold) lines.push(t.umbrella(Math.round(a.precipitation)));
  return { title: t.title(weekday), body: lines.join("\n") };
}
