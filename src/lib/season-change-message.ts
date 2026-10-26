// The season-change notification: when the next two weeks' highs make it worth moving pieces in
// or out of the cambio stagione (see seasonChangeSuggestions). Sent with the morning look, at most
// once every SEASON_CHANGE_GAP_DAYS, only when there are at least SEASON_CHANGE_MIN pieces to move.

export const SEASON_CHANGE_MIN = 5;
export const SEASON_CHANGE_GAP_DAYS = 60;

export function seasonChangeWorthTelling(putAway: number, bringBack: number): boolean {
  return putAway >= SEASON_CHANGE_MIN || bringBack >= SEASON_CHANGE_MIN;
}

const TEXT = {
  it: {
    title: "È il momento del cambio stagione?",
    temps: (a: number, b: number) => `Nelle prossime due settimane massime tra ${a}° e ${b}°`,
    away: (n: number) => `${n} ${n === 1 ? "capo" : "capi"} da mettere via`,
    back: (n: number) => `${n} da riprendere`,
    cta: "Tocca per vederli.",
    and: " e ",
  },
  en: {
    title: "Time for the seasonal switch?",
    temps: (a: number, b: number) => `Highs between ${a}° and ${b}° over the next two weeks`,
    away: (n: number) => `${n} ${n === 1 ? "piece" : "pieces"} to put away`,
    back: (n: number) => `${n} to bring back`,
    cta: "Tap to see them.",
    and: " and ",
  },
  es: {
    title: "¿Es momento del cambio de armario?",
    temps: (a: number, b: number) => `En las próximas dos semanas, máximas entre ${a}° y ${b}°`,
    away: (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"} para guardar`,
    back: (n: number) => `${n} para recuperar`,
    cta: "Toca para verlas.",
    and: " y ",
  },
  fr: {
    title: "C'est le moment du rangement saisonnier ?",
    temps: (a: number, b: number) => `Dans les deux prochaines semaines, maximales entre ${a}° et ${b}°`,
    away: (n: number) => `${n} ${n === 1 ? "pièce" : "pièces"} à ranger`,
    back: (n: number) => `${n} à ressortir`,
    cta: "Touchez pour les voir.",
    and: " et ",
  },
  zh: {
    title: "该换季收纳了吗？",
    temps: (a: number, b: number) => `未来两周最高气温 ${a}° 至 ${b}°`,
    away: (n: number) => `${n} 件可以收起来`,
    back: (n: number) => `${n} 件可以取出来`,
    cta: "点按查看。",
    and: "，",
  },
} as const;

export function seasonChangeMessage(
  language: string | null | undefined,
  a: { putAway: number; bringBack: number; minHigh: number; maxHigh: number },
): { title: string; body: string } {
  const t = TEXT[(language ?? "").slice(0, 2) as keyof typeof TEXT] ?? TEXT.en;
  const parts = [a.putAway ? t.away(a.putAway) : "", a.bringBack ? t.back(a.bringBack) : ""].filter(Boolean);
  const sep = (language ?? "").startsWith("zh") ? "：" : ": ";
  const end = (language ?? "").startsWith("zh") ? "。" : ".";
  return { title: t.title, body: `${t.temps(a.minHigh, a.maxHigh)}${sep}${parts.join(t.and)}${end} ${t.cta}` };
}
