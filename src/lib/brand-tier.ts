// How much of its price a piece keeps the moment it becomes second-hand, by brand tier. A Zara top
// resells for about a third of what it cost, a Max Mara coat for about half, a Chanel bag for most of
// it: the valuation curve used to start at 100% for everything (reported: "i costi dei prodotti
// in rivendita sono sempre troppo alti" — a €18 Zara top valued €13–17). Brands not listed are "mid".

export type BrandTier = "fast" | "mid" | "premium" | "luxury";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const FAST = [
  "zara", "h m", "hm", "mango", "bershka", "stradivarius", "pull bear", "primark", "shein", "asos", "reserved",
  "ovs", "terranova", "kiabi", "c a", "gap", "old navy", "forever 21", "new look", "topshop", "calzedonia",
  "intimissimi", "tezenis", "oysho", "lefties", "tally weijl", "piazza italia", "motivi", "fb sister", "sinsay",
  "boohoo", "prettylittlething", "nasty gal", "decathlon", "uniqlo", "benetton", "united colors of benetton",
];
const PREMIUM = [
  "cos", "arket", "other stories", "massimo dutti", "sandro", "maje", "claudie pierlot", "ba sh", "sezane",
  "ganni", "acne studios", "isabel marant", "a p c", "apc", "aspesi", "weekend max mara", "max co", "pinko",
  "twinset", "liu jo", "patrizia pepe", "ralph lauren", "polo ralph lauren", "tommy hilfiger", "calvin klein",
  "michael kors", "coach", "furla", "longchamp", "lacoste", "levi s", "levis", "diesel", "alo", "alo yoga",
  "lululemon", "the north face", "patagonia", "woolrich", "save the duck", "herno", "peuterey", "colmar",
  "golden goose", "hogan", "tod s", "tods", "stuart weitzman", "paris texas", "ermanno scervino", "ermanno firenze",
  "self portrait", "zimmermann", "reformation", "rotate", "ami paris", "jacquemus", "marni", "msgm", "n 21",
];
const LUXURY = [
  "hermes", "chanel", "louis vuitton", "dior", "christian dior", "gucci", "prada", "miu miu", "bottega veneta",
  "celine", "saint laurent", "ysl", "loewe", "fendi", "valentino", "balenciaga", "givenchy", "burberry",
  "max mara", "moncler", "loro piana", "brunello cucinelli", "the row", "khaite", "alaia", "chloe", "goyard",
  "cartier", "rolex", "van cleef arpels", "bulgari", "tiffany", "jimmy choo", "manolo blahnik", "christian louboutin",
  "aquazzura", "gianvito rossi", "rene caovilla", "dolce gabbana", "versace", "giorgio armani", "tom ford",
  "alexander mcqueen", "ferragamo", "salvatore ferragamo", "roger vivier", "mulberry", "delvaux", "kiton", "zegna",
];

const SETS: [BrandTier, Set<string>][] = [["luxury", new Set(LUXURY)], ["premium", new Set(PREMIUM)], ["fast", new Set(FAST)]];

/** The brand's tier; "mid" when the brand is unknown or missing. */
export function brandTier(brand: string | null | undefined): BrandTier {
  const b = norm(brand ?? "");
  if (!b) return "mid";
  for (const [tier, set] of SETS) if (set.has(b)) return tier;
  return "mid";
}

/** Share of the price kept on the day a piece becomes second-hand (before age and wear), by tier and
 *  by kind of piece. Calibrated on what the resale sites show (November 2026):
 *  - Vinted's own guidance: like new 60–80% of retail, very good 40–60%, good 20–40%; fast fashion
 *    sells at about a third of its price;
 *  - Vestiaire Collective: designer bags around 75% of retail, designer shoes around 57%; a used
 *    Max Mara 101801 coat sells for roughly a quarter to a half of its new price;
 *  - Buddy & Selly: designer clothing listed 30–90% below its new price.
 *  Clothing loses the most, bags the least; luxury shoes, jewellery and watches sit in between. */
export function secondHandShare(tier: BrandTier, category: string | null | undefined): number {
  const c = (category ?? "").trim().toLowerCase();
  const CLOTHING: Record<BrandTier, number> = { fast: 0.4, mid: 0.45, premium: 0.5, luxury: 0.55 };
  const BAGS: Record<BrandTier, number> = { fast: 0.45, mid: 0.55, premium: 0.65, luxury: 0.85 };
  const SHOES_ACCESSORIES: Record<BrandTier, number> = { fast: 0.35, mid: 0.45, premium: 0.5, luxury: 0.65 };
  if (c === "bags") return BAGS[tier];
  if (c === "shoes" || c === "accessories") return SHOES_ACCESSORIES[tier];
  return CLOTHING[tier];
}
