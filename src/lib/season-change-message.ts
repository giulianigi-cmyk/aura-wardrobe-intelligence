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
    away: (n: number) => `${n} ${n === 1 ? "capo" : "capi"} da spostare nel cambio stagione`,
    back: (n: number) => `${n} da riprendere`,
    cta: "Tocca per vederli.",
    and: " e ",
  },
  en: {
    title: "Time for seasonal storage?",
    temps: (a: number, b: number) => `Highs between ${a}° and ${b}° over the next two weeks`,
    away: (n: number) => `${n} ${n === 1 ? "piece" : "pieces"} to move to seasonal storage`,
    back: (n: number) => `${n} to take out`,
    cta: "Tap to see them.",
    and: " and ",
  },
  es: {
    title: "¿Es momento del cambio de armario?",
    temps: (a: number, b: number) => `En las próximas dos semanas, máximas entre ${a}° y ${b}°`,
    away: (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"} para pasar al cambio de armario`,
    back: (n: number) => `${n} para sacar`,
    cta: "Toca para verlas.",
    and: " y ",
  },
  fr: {
    title: "C'est le moment du rangement saisonnier ?",
    temps: (a: number, b: number) => `Dans les deux prochaines semaines, maximales entre ${a}° et ${b}°`,
    away: (n: number) => `${n} ${n === 1 ? "pièce" : "pièces"} à mettre au rangement saisonnier`,
    back: (n: number) => `${n} à sortir`,
    cta: "Touchez pour les voir.",
    and: " et ",
  },
  zh: {
    title: "该换季收纳了吗？",
    temps: (a: number, b: number) => `未来两周最高气温 ${a}° 至 ${b}°`,
    away: (n: number) => `${n} 件可移入换季收纳`,
    back: (n: number) => `${n} 件可从换季收纳取出`,
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
