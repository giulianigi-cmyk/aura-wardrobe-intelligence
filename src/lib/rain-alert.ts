// Rain on the day of a planned outfit: tell the person in the morning, before they leave. Two cases:
// a planned piece is wrong in the rain (rain-rules.ts) → "change the outfit" with an adapted look;
// the outfit is fine → "take an umbrella". Pure: the worker (plan-weather.server.ts) decides when
// and sends it.
import { isRainyCode, UMBRELLA_PRECIPITATION_THRESHOLD } from "./weather-constants";
import { rainReason, type RainCheckable } from "./rain-rules";

export type RainAlert = { kind: "swap" | "umbrella"; unsuitableIds: string[]; chance: number };

/** A wet day: a rainy forecast code, or a chance of rain at or above the umbrella threshold. */
export function isWetDay(day: { code: number; precipitation: number }): boolean {
  return isRainyCode(day.code) || day.precipitation >= UMBRELLA_PRECIPITATION_THRESHOLD;
}

export function rainAlertFor(
  day: { code: number; precipitation: number },
  items: (RainCheckable & { id: string })[],
): RainAlert | null {
  if (!isWetDay(day)) return null;
  const unsuitableIds = items.filter((it) => rainReason(it) != null).map((it) => it.id);
  return { kind: unsuitableIds.length ? "swap" : "umbrella", unsuitableIds, chance: Math.round(day.precipitation) };
}

const TEXT = {
  it: {
    swapTitle: "Oggi piove: cambia l'outfit",
    swap: (pieces: string, alt: boolean) => `${pieces} non è adatto alla pioggia. ${alt ? "Ti propongo un'alternativa: tocca per vederla." : "Valuta di cambiarlo."} Porta l'ombrello.`,
    umbrellaTitle: "Oggi piove: prendi l'ombrello",
    umbrella: (c: number) => `${c}% di probabilità di pioggia. Il tuo outfit va bene, ma non dimenticare l'ombrello.`,
  },
  en: {
    swapTitle: "Rain today: change your outfit",
    swap: (pieces: string, alt: boolean) => `${pieces} isn't right for the rain. ${alt ? "Tap to see an alternative." : "Consider changing it."} Take an umbrella.`,
    umbrellaTitle: "Rain today: take an umbrella",
    umbrella: (c: number) => `${c}% chance of rain. Your outfit works, just don't forget your umbrella.`,
  },
  es: {
    swapTitle: "Hoy llueve: cambia el outfit",
    swap: (pieces: string, alt: boolean) => `${pieces} no va bien con la lluvia. ${alt ? "Toca para ver una alternativa." : "Piensa en cambiarlo."} Lleva paraguas.`,
    umbrellaTitle: "Hoy llueve: coge el paraguas",
    umbrella: (c: number) => `${c}% de probabilidad de lluvia. Tu outfit funciona, pero no olvides el paraguas.`,
  },
  fr: {
    swapTitle: "Pluie aujourd'hui : changez de tenue",
    swap: (pieces: string, alt: boolean) => `${pieces} ne convient pas à la pluie. ${alt ? "Touchez pour voir une alternative." : "Pensez à le changer."} Prenez un parapluie.`,
    umbrellaTitle: "Pluie aujourd'hui : prenez un parapluie",
    umbrella: (c: number) => `${c} % de risque de pluie. Votre tenue convient, n'oubliez pas votre parapluie.`,
  },
} as const;

/** `pieces`: the unsuitable pieces as the person reads them ("camicia di lino beige"). */
export function rainAlertMessage(
  language: string | null | undefined, alert: RainAlert, pieces: string[], hasAlternative = true,
): { title: string; body: string } {
  const t = TEXT[(language ?? "").slice(0, 2) as keyof typeof TEXT] ?? TEXT.en;
  if (alert.kind === "swap") {
    const named = pieces.slice(0, 2).join(", ");
    const lead = named ? named.charAt(0).toUpperCase() + named.slice(1) : "";
    return { title: t.swapTitle, body: t.swap(lead || "—", hasAlternative) };
  }
  return { title: t.umbrellaTitle, body: t.umbrella(alert.chance) };
}
