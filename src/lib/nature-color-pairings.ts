// Colour pairings taken from nature, for people who like to experiment (profile boldness "Creative"
// or "Bold"): if nature puts two colours together, they work together. How far a look goes depends on
// the occasion — a whole look in the pairing for a weekend, one accent piece at work, nothing loud at a
// funeral. Used by the outfit engine (ai-suggest-outfit.functions.ts) and the stylist chat.

/** Pairings seen in nature, each with what it comes from. */
export const NATURE_PAIRINGS: { colours: string; from: string }[] = [
  { colours: "cobalt / royal blue + emerald or lime green", from: "a peacock's feathers" },
  { colours: "burgundy / plum + mustard or golden yellow", from: "a cut passion fruit" },
  { colours: "sage / pistachio green + powder or blush pink", from: "a ripe fig" },
  { colours: "orange / rust + powder or sky blue", from: "a sunset over the sea" },
  { colours: "pale lemon yellow + purple / aubergine", from: "a spotted orchid" },
  { colours: "terracotta + olive green", from: "autumn leaves on earth" },
  { colours: "lavender + butter yellow", from: "a field of lavender and broom" },
];

export type PairingLevel = "full" | "accent" | "none";

const SOMBRE = /funeral|funerale|lutto|funeral|funérailles|obsequ|condolen/i;
const FORMAL = /wedding|matrimonio|boda|mariage|gala|black.?tie|ceremon|cerimoni|battesim|comunion|church|chiesa|iglesia|église|embassy|ambasciata|interview|colloquio|entrevista|entretien/i;
const WORK = /^\s*(work|travel)\b|lavoro|ufficio|office|meeting|riunion|fiera|trade ?fair|exhibition|conferen|congress|client|business/i;

/** How much colour play the occasion leaves room for. */
export function pairingLevelFor(occasion: string | null | undefined): PairingLevel {
  const text = occasion ?? "";
  if (SOMBRE.test(text)) return "none";
  if (FORMAL.test(text) || WORK.test(text)) return "accent";
  return "full";
}

/** The prompt rule for an experimental person, or null when it does not apply. */
export function naturePairingRule(styleBoldness: string | null | undefined, occasion: string | null | undefined): string | null {
  if (styleBoldness !== "Creative" && styleBoldness !== "Bold") return null;
  const level = pairingLevelFor(occasion);
  if (level === "none") return null;
  const list = NATURE_PAIRINGS.map((p) => `${p.colours} (${p.from})`).join("; ");
  const dose = level === "full"
    ? "For this occasion the whole look may be built on one of these pairings (e.g. a lime jacket over a cobalt knit, a mustard coat over a burgundy dress)."
    : "This occasion is professional or formal: keep the structure polished and bring the pairing in through ONE or two pieces only (a blouse, a knit, the bag or the shoes against a neutral suit or coat) — never a head-to-toe colour statement.";
  return `NATURE COLOUR PAIRINGS: this person likes to experiment with colour. If nature puts two colours together, they work together — use the wardrobe's own coloured pieces to propose pairings like: ${list}. Choose a pairing only from colours the listed pieces actually have; never invent a piece. ${dose} Every other rule (occasion, dress code, weather, rain) still comes first.`;
}
