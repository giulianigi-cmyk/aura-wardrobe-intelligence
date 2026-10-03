// Construction / finish details of a garment that make two pieces of the same kind different to
// wear (a patent slingback vs a closed leather pump), plus how a bag can be carried. Shared by:
//  - the photo analysis (ai-analyze.functions.ts), which stores the keys in wardrobe_items.details;
//  - the purchase advisor's similarity check (purchase-similarity.ts), which also reads them from
//    product text;
//  - the wardrobe-gap ownership check (gap-ownership.ts): a bag carried crossbody covers "crossbody".

// Details that make two pieces of the same kind genuinely different to wear: a patent slingback is
// not the same shoe as a leather closed pump, even from the same house and in the same colour.
// Words in it/en/es/fr; matched on the product's own text and the owned piece's data.
export const DETAILS: Record<string, string[]> = {
  slingback: ["slingback", "sling back", "sling-back", "chanel back"],
  maryJane: ["mary jane", "mary-jane", "maryjane"],
  patent: ["patent", "vernice", "verniciat", "lucida", "lucide", "lucido", "glossy", "laccat", "vernis", "charol"],
  suede: ["suede", "camoscio", "daim", "ante "],
  satin: ["satin", "raso", "satén"],
  velvet: ["velvet", "velluto", "terciopelo", "velours"],
  mesh: ["mesh", "rete", "resille", "rejilla"],
  embellished: ["crystal", "cristall", "strass", "swarovski", "rhinestone", "embellish", "gioiello", "jewel", "bijou", "pearl", "perle"],
  metallic: ["metallic", "metallizzat", "laminat", "specchio", "mirror", "metalizad", "métallisé"],
  platform: ["platform", "plateau", "plataforma"],
  ankleStrap: ["ankle strap", "cinturino", "correa al tobillo", "bride cheville"],
  openToe: ["peep toe", "open toe", "spuntat", "punta aperta"],
  kittenHeel: ["kitten heel", "kitten"],
  quilted: ["quilted", "trapuntat", "matelass", "acolchad"],
  chain: ["chain strap", "tracolla a catena", "catena", "cadena", "chaîne"],
  logo: ["logo", "monogram"],
  animalPrint: ["leopard", "leopardat", "animalier", "zebra", "python", "pitone", "croco", "cocco"],
};

/** Ways a bag can be carried (photo analysis only: a product text rarely says it reliably). */
export const BAG_CARRY_KEYS = ["shoulder", "crossbody", "handheld"] as const;

/** Every key the photo analysis may return. */
export const DETAIL_KEYS = [...Object.keys(DETAILS), ...BAG_CARRY_KEYS];

/** A plain word for each key, so stored keys can be matched like text. */
export const DETAIL_WORDS_FOR_KEY: Record<string, string> = Object.fromEntries([
  ...Object.entries(DETAILS).map(([k, words]) => [k, words[0]]),
  ["shoulder", "shoulder carry"], ["crossbody", "crossbody carry"], ["handheld", "handheld carry"],
]);

export function detailsIn(text: string): Set<string> {
  const t = ` ${text.toLowerCase()} `;
  return new Set(Object.entries(DETAILS).filter(([, words]) => words.some((w) => t.includes(w))).map(([k]) => k));
}
