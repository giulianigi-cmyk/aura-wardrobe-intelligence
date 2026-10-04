// Two things a person weighs before buying that the advisor ignored:
//  - the SAME model already owned (two Victoria Beckham Alina jeans owned → a third Alina, in a
//    slightly darker wash, is a variant, not something new);
//  - the price against what THIS person usually spends on that kind of piece: 450 € for jeans is a
//    lot for someone whose jeans cost 50 €, normal for someone whose jeans cost 400 €.

import type { WardrobeItem } from "./aura-types";
import { convertCurrency } from "./currency-rates";
import { parsePositivePrice } from "./price-parse";
import { colorLightness } from "./outfit-match";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Owned pieces of the same brand AND model as the product (the model name appears in the product's
 *  name), any type within the category (Alina jeans and Alina trousers are the same model). */
export function sameModelOwned(
  product: { brand: string | null; title: string | null; category: string | null },
  wardrobe: WardrobeItem[],
): WardrobeItem[] {
  const brand = norm(product.brand);
  const title = ` ${norm(product.title)} `;
  if (!brand || title.trim() === "") return [];
  return wardrobe.filter((it) => {
    const model = norm(it.model);
    if (!model || model.length < 3) return false;
    if (norm(it.brand) !== brand) return false;
    if (product.category && it.category && it.category !== product.category) return false;
    return title.includes(` ${model} `);
  });
}

export type PriceContext = {
  priceEur: number;
  /** Median of what the person paid for this kind of piece (EUR). */
  usualEur: number;
  /** The top of what they usually pay for it (90th percentile, EUR). */
  topEur: number;
  /** How many priced pieces it comes from. */
  basedOn: number;
  /** above_usual = beyond even the top of their range; upper_range = within their range but at its
   *  expensive end; usual / below_usual. */
  tier: "above_usual" | "upper_range" | "usual" | "below_usual";
  /** What they paid for the same model, when it's owned and priced (EUR). */
  sameModelPaidEur: number | null;
};

function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** The product's price against what THIS person pays for the SAME kind of piece — never the whole
 *  category: a cashmere sweater compared with t-shirts, or jeans with leggings and shorts, gives a
 *  meaningless "usual price". The pool is the same type and, when the material is known and enough
 *  pieces share it, the same material too (cashmere with cashmere). Fewer than 3 priced pieces of
 *  the same type: no price judgement at all rather than a wrong one. Not the median alone either:
 *  someone whose jeans usually cost 170 € but who has several at 400–600 € isn't spending "more
 *  than usual" on a 400 € pair, it's the expensive end of their own range. */
export function priceContext(
  product: { price: string | null; currency: string | null; category: string | null; subcategory?: string | null; material?: string | null },
  wardrobe: WardrobeItem[],
  sameModel: WardrobeItem[] = [],
): PriceContext | null {
  const amount = parsePositivePrice(product.price);
  if (amount == null || !product.subcategory) return null;
  const priceEur = convertCurrency(amount, (product.currency ?? "EUR").toUpperCase(), "EUR");
  const eur = (it: WardrobeItem) => {
    const p = parsePositivePrice((it as { price?: unknown }).price);
    return p == null ? null : convertCurrency(p, String((it as { currency?: string | null }).currency ?? "EUR").toUpperCase(), "EUR");
  };
  const priced = (items: WardrobeItem[]) => items.map(eur).filter((x): x is number => x != null);
  const sameType = wardrobe.filter((it) => it.category === product.category && it.subcategory === product.subcategory);
  const material = norm(product.material);
  const sameMaterial = material
    ? sameType.filter((it) => (Array.isArray(it.material) ? it.material : []).some((m) => { const n = norm(m); return n && (n.includes(material) || material.includes(n)); }))
    : [];
  const pool = priced(sameMaterial).length >= 3 ? priced(sameMaterial) : priced(sameType);
  if (pool.length < 3) return null;
  const usualEur = percentile(pool, 0.5);
  const topEur = percentile(pool, 0.9);
  const paid = priced(sameModel);
  const sameModelPaidEur = paid.length ? percentile(paid, 0.5) : null;
  let tier: PriceContext["tier"] =
    priceEur > topEur * 1.2 ? "above_usual"
    : priceEur > usualEur * 1.5 ? "upper_range"
    : priceEur < usualEur * 0.67 ? "below_usual"
    : "usual";
  // Already paid about this much for the same model: it is within their habits by definition.
  if (tier === "above_usual" && sameModelPaidEur != null && priceEur <= sameModelPaidEur * 1.25) tier = "upper_range";
  return { priceEur: Math.round(priceEur), usualEur: Math.round(usualEur), topEur: Math.round(topEur), basedOn: pool.length, tier, sameModelPaidEur: sameModelPaidEur == null ? null : Math.round(sameModelPaidEur) };
}

/** "darker" / "lighter" when the product's colour is clearly darker or lighter than the owned piece's. */
export function shadeDifference(productColors: string[], ownedColors: string[]): "darker" | "lighter" | null {
  const avg = (cs: string[]) => {
    const ls = cs.map(colorLightness).filter((x): x is number => x != null);
    return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
  };
  const p = avg(productColors), o = avg(ownedColors);
  if (p == null || o == null) return null;
  if (p <= o - 6) return "darker";
  if (p >= o + 6) return "lighter";
  return null;
}

/** On top of the wardrobe/fashion verdict, never an upgrade:
 *  - far beyond what the person usually pays for this kind of piece (above the top of their range)
 *    while something similar is already owned and it isn't an iconic piece → "skip": it adds nothing
 *    but the label (1100 € jeans next to a similar pair, when jeans usually cost up to ~360 €);
 *  - the same model already owned and a price at the top of (or above) their range, or two of the
 *    same model already → "maybe" instead of "buy". */
export function applyPurchaseContext<V extends { verdict: "buy" | "maybe" | "skip"; confidence: "high" | "medium" | "low" }>(
  base: V,
  ctx: { sameModelCount: number; price: PriceContext | null; wardrobeGap: boolean; similarOwned?: boolean; iconic?: boolean },
): V {
  if (base.verdict === "skip" || ctx.wardrobeGap) return base;
  if (ctx.price?.tier === "above_usual" && ctx.similarOwned && !ctx.iconic) return { ...base, verdict: "skip", confidence: "medium" };
  if (base.verdict !== "buy") return base;
  if (ctx.sameModelCount >= 1 && (ctx.price?.tier === "above_usual" || ctx.price?.tier === "upper_range")) return { ...base, verdict: "maybe", confidence: "medium" };
  if (ctx.sameModelCount >= 2) return { ...base, verdict: "maybe", confidence: "medium" };
  return base;
}

// ---------------------------------------------------------------------------------------------
// Cost per wear. The price alone says little: jeans worn all year cost less per wear than an evening
// gown, a summer-only mini dress, a cut-out piece or crystal heels. Expected wears come from the
// person's own history for that kind of piece once there is enough of it (6+ months, 3+ pieces);
// otherwise an ESTIMATE of how usable the piece is: a modest base for its kind, then its seasons
// (all year vs one season), day/evening range, how dressy it is, statement details (crystals,
// sequins, cut-outs), whether it is timeless or a trend piece, its versatility — and the similar
// pieces it would rotate with. The reasons are returned so the person sees why.
// ---------------------------------------------------------------------------------------------

/** How many days a year a piece of this outfit role is worn, if it were needed all year round and
 *  by day (whichever piece of the role is chosen): one bag and one pair of shoes almost every day,
 *  a bottom and a top on every day without a dress, a bra or briefs every day, a coat on every day
 *  that needs an outer layer, a blazer a couple of days a week… Seasons, evenings and the pieces
 *  it rotates with then decide the share of the new piece. */
function roleDemand(role: string, subcategory: string | null | undefined): number {
  const s = (subcategory ?? "").toLowerCase();
  switch (role) {
    case "bags": case "shoes": return 300;
    case "jeans": case "trousers": return 130;
    case "skirt": case "leggings": return 80;
    case "shorts": return 200;
    case "top": return 200;
    case "shirt": return 120;
    case "coat": return 250;
    case "jacket": return 120;
    case "sweater": return 150;
    case "cardigan": return 100;
    case "sweatshirt": return 80;
    case "onepiece": return 90;
    case "blazer": case "suit": return 100;
    case "vest": return 60;
    case "swim|top": case "swim|bottom": return 120;
    case "active|top": case "active|bottom": case "active|bra": return 150;
    case "underwear|bra": return 330;
    case "underwear|briefs": case "underwear|sleep": return 365;
    case "underwear|tights": return 150;
    case "underwear|shapewear": return 40;
  }
  if (role.startsWith("underwear")) return 200;
  if (role.startsWith("accessories")) {
    if (/watch|orologio/.test(s)) return 300;
    if (/sunglass|occhiali|earring|orecchin|ring|anello/.test(s)) return 250;
    if (/bracelet|bracciale/.test(s)) return 200;
    if (/belt|cintura|necklace|collana|scarf|sciarpa|foulard/.test(s)) return 150;
    if (/hair|capelli/.test(s)) return 120;
    if (/hat|cap|cappello|beanie/.test(s)) return 60;
    return 100;
  }
  return 80;
}


export type WearReason = "yourHistory" | "allSeasons" | "oneSeason" | "fewSeasons" | "dayAndEvening" | "eveningOnly" | "veryDressy" | "statement" | "trendPiece" | "timeless" | "versatile" | "notVersatile" | "rotation" | "formalAllYear";

export type CostPerWear = {
  wearsPerYear: number;
  /** Years the cost is spread over (shown to the person). */
  years: number;
  costPerWearEur: number;
  /** Similar pieces of the same type already owned (they share the wears). */
  rotatingWith: number;
  basis: "history" | "estimate";
  /** Why the estimate is what it is (only for basis "estimate"). */
  reasons: WearReason[];
};

export const CPW_YEARS = 2;

export type WearProfile = {
  category: string | null;
  subcategory: string | null;
  seasons?: string[];
  dayEvening?: string | null;
  formality?: number | null;
  /** Flat / Low / Mid / High (shoes). */
  heelHeight?: string | null;
  /** Detail keys (garment-details.ts) of the product, e.g. embellished, cutOut. */
  details?: string[];
  fashion?: { timeless: boolean; onTrend: boolean; versatility: "low" | "medium" | "high" } | null;
};

/** Estimated wears per year of the piece and why (no history). */
/** Evenings out a year: weekends all year round, 2–3 evenings a week. */
export const EVENINGS_OUT_PER_YEAR = 130;
/** Black-tie, gala and wedding-type events a year. */
export const FORMAL_EVENTS_PER_YEAR = 6;

export function estimateWears(p: WearProfile, rotatingWith: number): { wearsPerYear: number; reasons: WearReason[] } {
  const role = outfitRole(p.category, p.subcategory);
  const when = dayRole(p.subcategory, p.dayEvening);
  const reasons: WearReason[] = [];
  let demand = roleDemand(role, p.subcategory);
  // Bags and shoes: an evening one is carried on every night out — weekends all year round, 2–3
  // evenings a week. Clothes worn only at night: about a third of the days.
  const seasons = seasonSet(p.seasons);
  const seasonShare = seasons.size / 4;
  if (seasons.size === 4) reasons.push("allSeasons");
  else reasons.push(seasons.size === 1 ? "oneSeason" : "fewSeasons");
  if (when === "evening") {
    demand = role === "bags" || role === "shoes" ? EVENINGS_OUT_PER_YEAR : demand * 0.35;
    reasons.push("eveningOnly");
  } else if (when === "both") reasons.push("dayAndEvening");
  // Black-tie and gala pieces are worn at those events only, a handful a year.
  if ((p.formality ?? 0) >= 5) { demand = Math.min(demand, FORMAL_EVENTS_PER_YEAR); reasons.push("veryDressy"); }
  let w = demand * seasonShare;
  // Elegant pieces also come out of season for a gala or a very elegant evening — a fine-heeled
  // sandal with tights in winter — but not every summer piece: a flat or beach sandal, a straw bag
  // or a linen dress stay in their season. Shoes: on a real heel and for the evening or formal
  // (formal alone when the heel is unknown); bags and dresses: formal.
  const formal = (p.formality ?? 0) >= 4;
  const heeled = p.heelHeight === "Mid" || p.heelHeight === "High";
  const dressyEvening = role === "shoes" ? (p.heelHeight ? heeled && (formal || when === "evening") : formal)
    : (role === "bags" || role === "onepiece") && formal;
  if (dressyEvening && seasons.size < 4) {
    w += FORMAL_EVENTS_PER_YEAR * (1 - seasonShare);
    reasons.push("formalAllYear");
  }
  const cap = w;
  // Shared with the pieces it rotates with. Not an exact split: who owns more of something tends to
  // wear that kind of piece more often, so the share shrinks a little slower than 1/n.
  if (rotatingWith > 0) { w /= Math.pow(rotatingWith + 1, 0.9); reasons.push("rotation"); }
  if (when === "both") w *= 1.1;
  // Crystals, sequins or cut-outs limit a day piece; at night they are what it is worn for.
  if (when !== "evening" && (p.details ?? []).some((d) => d === "embellished" || d === "cutOut")) { w *= 0.55; reasons.push("statement"); }
  if (p.fashion?.onTrend && !p.fashion.timeless) { w *= 0.8; reasons.push("trendPiece"); }
  else if (p.fashion?.timeless) { w *= 1.1; reasons.push("timeless"); }
  if (p.fashion?.versatility === "high") { w *= 1.15; reasons.push("versatile"); }
  else if (p.fashion?.versatility === "low") { w *= 0.6; reasons.push("notVersatile"); }
  // Nobody wears the same garment every day; a bag, shoes, underwear or jewellery can come close.
  const everyday = role === "bags" || role === "shoes" || role.startsWith("underwear") || role.startsWith("accessories");
  w = Math.min(w, cap * (everyday ? 0.9 : 0.6));
  return { wearsPerYear: Math.max(1, Math.round(w)), reasons };
}

/** How much the person's own history weighs against the estimate: 0 with no history, 1 once the
 *  owned pieces of this type add up to about 3 "piece-years" of wear logging (e.g. 6 jeans for 6
 *  months) over at least half a year. It grows with every month and every piece, so the estimate
 *  moves towards their real use instead of switching at a fixed date. */
export const HISTORY_FULL_WEIGHT_PIECE_YEARS = 3;

const EVENING_ONLY = /clutch|pochette|minaudi/i;
const DAY_OCCASION = /everyday|work|weekend|travel|casual|resort|office|daily|beach|sport/i;
const EVENING_OCCASION = /evening|formal|cocktail|wedding|black tie|gala|party|dinner/i;
const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

/** The outfit role a piece fills: pieces with the same role are the ones you choose between on a
 *  given day. Bags and shoes rotate whatever their shape (a pump with sandals and sneakers, a tote
 *  with a top-handle bag); dresses and jumpsuits are all one-piece outfits. Clothes rotate with
 *  their own kind, because a day in jeans is not a day in tailored trousers: jeans with jeans,
 *  trousers with trousers, sweaters with sweaters, coats with coats, jackets with jackets, blazers
 *  with blazers, shirts with shirts. Underwear, swimwear and activewear rotate by piece (a bra with
 *  bras); accessories by type (a belt with belts, earrings with earrings). */
function outfitRole(category: string | null | undefined, subcategory: string | null | undefined): string {
  const c = (category ?? "").toLowerCase();
  const s = (subcategory ?? "").toLowerCase();
  if (/bag|borse|borsa/.test(c) || /bag|tote|clutch|pochette|minaudi/.test(s)) return "bags";
  if (/shoe|scarpe|footwear/.test(c)) return "shoes";
  if (/suit|complet|tailleur/.test(c) || /suit|complet|tailleur/.test(s)) return "suit";
  if (/swim|costum/.test(c)) return /bottom|slip/.test(s) ? "swim|bottom" : "swim|top";
  if (/active|sport/.test(c)) return /bra|reggiseno/.test(s) ? "active|bra" : /legging|short|pant|jogger/.test(s) ? "active|bottom" : "active|top";
  if (/underwear|intimo|lingerie/.test(c)) {
    if (/tight|stocking|calz|collant/.test(s)) return "underwear|tights";
    if (/bra|reggiseno|bralette/.test(s)) return "underwear|bra";
    if (/pant|brief|thong|slip|culotte|mutand/.test(s)) return "underwear|briefs";
    if (/sleep|pajama|pyjama|pigiama|nightgown|camicia da notte/.test(s)) return "underwear|sleep";
    if (/shape|guaina/.test(s)) return "underwear|shapewear";
    return `underwear|${s}`;
  }
  if (/dress|abiti|jumpsuit|tute/.test(c)) return "onepiece";
  if (/outer|capispalla/.test(c)) {
    if (/blazer/.test(s)) return "blazer";
    if (/vest|gilet/.test(s)) return "vest";
    if (/coat|trench|parka|puffer|cappotto|piumino|montgomery|peacoat/.test(s)) return "coat";
    return "jacket";
  }
  if (/top|maglie/.test(c)) {
    if (/cardigan/.test(s)) return "cardigan";
    if (/hoodie|sweatshirt|felpa/.test(s)) return "sweatshirt";
    if (/sweater|jumper|pullover|maglion/.test(s)) return "sweater";
    if (/shirt|blouse|camicia/.test(s) && !/t-?shirt/.test(s)) return "shirt";
    return "top";
  }
  if (/bottom|pantaloni/.test(c)) {
    if (/jean/.test(s)) return "jeans";
    if (/skirt|gonna/.test(s)) return "skirt";
    if (/short/.test(s)) return "shorts";
    if (/legging/.test(s)) return "leggings";
    return "trousers";
  }
  if (/accessor/.test(c)) return `accessories|${s}`;
  return `${c}|${s}`;
}

type DayRole = "day" | "evening" | "both";

/** When a piece is worn: from its day/evening field and its occasions; clutches are evening. */
function dayRole(subcategory: string | null | undefined, dayEvening: string | null | undefined, occasion?: string | null): DayRole {
  if (EVENING_ONLY.test(subcategory ?? "")) return "evening";
  if (dayEvening === "evening") return "evening";
  if (dayEvening === "day") return "day";
  if (occasion) {
    const day = DAY_OCCASION.test(occasion);
    const evening = EVENING_OCCASION.test(occasion);
    if (day && !evening) return "day";
    if (evening && !day) return "evening";
  }
  return "both";
}

function seasonSet(v: string | string[] | null | undefined): Set<string> {
  const text = (Array.isArray(v) ? v.join(",") : v ?? "").toLowerCase();
  const found = SEASONS.filter((x) => text.includes(x) || (x === "autumn" && text.includes("fall")));
  return new Set(!text || /all/.test(text) || !found.length ? SEASONS : found);
}

/** The owned pieces a new one would share its wears with — same outfit role, worn at the same time
 *  of day (an evening piece doesn't compete with day-only ones) and in overlapping seasons — and
 *  how many they amount to: each counts by the share of seasons the two have in common. A coat
 *  in a wardrobe with few coats is worn far more often than a top among fifty. */
export function rotationPool(product: WearProfile, wardrobe: WardrobeItem[]): { items: WardrobeItem[]; effective: number } {
  const role = outfitRole(product.category, product.subcategory);
  const when = dayRole(product.subcategory, product.dayEvening);
  const seasons = seasonSet(product.seasons);
  const items: WardrobeItem[] = [];
  let effective = 0;
  for (const it of wardrobe) {
    if ((it as { archived?: boolean }).archived) continue;
    if (outfitRole(it.category, it.subcategory) !== role) continue;
    const itWhen = dayRole(it.subcategory, (it as { day_evening?: string | null }).day_evening, (it as { occasion?: string | null }).occasion);
    if (when !== "both" && itWhen !== "both" && itWhen !== when) continue;
    const itSeasons = seasonSet((it as { season?: string | null }).season);
    // How much the two compete: the shared seasons, as a share of both. A summer sandal and an
    // all-season pump meet only in summer, a quarter of the pump's year: the pump counts a quarter.
    const shared = [...seasons].filter((x) => itSeasons.has(x)).length;
    if (shared === 0) continue;
    const overlap = (shared * shared) / (seasons.size * itSeasons.size);
    items.push(it);
    // A day-and-evening piece covers only part of the nights out (it is worn by day too), so for an
    // evening piece it counts half.
    effective += when === "evening" && itWhen === "both" ? overlap / 2 : overlap;
  }
  return { items, effective };
}

export function costPerWear(
  product: WearProfile,
  wardrobe: WardrobeItem[],
  price: PriceContext | null,
  now: Date = new Date(),
  /** Share of days the person logs what they wear (0.2–1): wears not logged are not counted, so the
   *  logged rate is scaled up by it. */
  loggingCoverage = 1,
): CostPerWear | null {
  if (!price || !product.subcategory) return null;
  const { items: sameType, effective } = rotationPool(product, wardrobe);
  // Time in the APP, not since purchase: wears are only logged from when the piece was added, so a
  // pair bought in 2020 and added six weeks ago has six weeks of history, not six years.
  const yearsOwned = (it: WardrobeItem) => {
    const since = (it as { created_at?: string }).created_at;
    return since ? Math.max(0, (now.getTime() - new Date(since).getTime()) / (365 * 86400000)) : 0;
  };
  // The person's own wear rate for this kind of piece: logged wears per piece per year, over the
  // pieces that have been in the app for at least a month.
  const observed = sameType.filter((it) => yearsOwned(it) >= 1 / 12);
  const pieceYears = observed.reduce((sum, it) => sum + yearsOwned(it), 0);
  const wears = observed.reduce((sum, it) => sum + ((it as { worn_count?: number }).worn_count ?? 0), 0);
  // Enough pieces AND enough time: six weeks with 24 jeans is a lot of piece-years but a single
  // season — the history only takes over fully once it covers at least half a year.
  const span = observed.reduce((m, it) => Math.max(m, yearsOwned(it)), 0);
  const weight = Math.min(1, pieceYears / HISTORY_FULL_WEIGHT_PIECE_YEARS) * Math.min(1, span / 0.5);
  const est = estimateWears(product, effective);
  let wearsPerYear = est.wearsPerYear;
  let basis: CostPerWear["basis"] = "estimate";
  const reasons = [...est.reasons];
  if (weight > 0 && pieceYears > 0) {
    // Logged wears are spread over all the similar pieces already; the new one would join them, so
    // its share is the per-piece rate — the same rotation the estimate models.
    const coverage = Math.min(1, Math.max(0.2, loggingCoverage));
    const ownRate = wears / pieceYears / coverage;
    wearsPerYear = Math.max(1, Math.round(weight * ownRate + (1 - weight) * est.wearsPerYear));
    if (weight >= 1) basis = "history";
    else reasons.push("yourHistory");
  }
  return {
    wearsPerYear,
    years: CPW_YEARS,
    costPerWearEur: Math.round(price.priceEur / (wearsPerYear * CPW_YEARS)),
    rotatingWith: sameType.length,
    basis,
    reasons: basis === "history" ? [] : reasons,
  };
}
