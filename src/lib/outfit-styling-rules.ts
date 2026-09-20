// Shared, non-weather styling rules — kept separate from
// outfit-weather-rules.ts since these are about garment composition,
// not temperature. Same reasoning as that file's own header: one rule
// defined once, imported by every engine that composes an outfit
// (ai-suggest-outfit.functions.ts, suggest-daily-looks.functions.ts,
// stylist-chat.functions.ts), so a fix here never has to be repeated —
// or worse, drift — in three different places.

/** A belt over a bodycon/fitted dress fights the silhouette the dress
 *  is already built to show — there's no waist definition left for a
 *  belt to add, only a break in a line that's supposed to be
 *  continuous. Existing softer guidance ("skip a belt on a Slim/
 *  Tailored fit piece") wasn't being followed reliably enough in
 *  practice, so this states the bodycon case explicitly and as a hard
 *  rule rather than a soft preference. */
export const BELT_BODYCON_PROMPT_RULE =
  "BELT RULE — HARD EXCLUSION: never pair a belt with a bodycon, second-skin, or otherwise tightly fitted dress (a dress whose own subcategory, description, or fit says bodycon/fitted/second-skin, or one made of a stretch/clingy fabric worn skin-tight throughout). " +
  "The dress's silhouette already does the defining; a belt breaks the line rather than adding one. This applies regardless of occasion or formality — a belt is never the right addition to that specific kind of dress, full stop.";

/** Every wardrobe piece — including bags, shoes and other accessories —
 *  carries its own occasion tags, and those tags mean the same thing
 *  for an accessory as for a top or a dress: a bag tagged only for
 *  Weekend/Travel is exactly as wrong for an Evening look as a hoodie
 *  would be, even though "it's just a bag" can make that feel like a
 *  smaller violation than it actually is. */
export const ACCESSORY_OCCASION_PROMPT_RULE =
  "ACCESSORY OCCASION MATCHING: a bag, pair of shoes, or other accessory's own occasion tags are just as binding as they are for a top, bottom, or dress — never propose one tagged only for Weekend/Travel/Sport for a Work/Evening/Formal look, or vice-versa, purely because it 'still looks fine' physically. " +
  "If nothing in the wardrobe has a bag tagged for the occasion at hand, say so rather than reaching for the closest large or casual bag anyway — a missing piece is more honest than a wrong one.";

/** An open-front cardigan, wrap top, duster, or open knit is a LAYER,
 *  not a complete top on its own — worn alone it leaves the torso
 *  genuinely exposed (unlike a buttoned cardigan or a blazer over
 *  nothing, which at least closes), not a styling choice some people
 *  happen to prefer. This showed up as a real outfit: a wrap-front
 *  cardigan proposed with jeans and shoes and nothing at all worn
 *  underneath it. */
export const OPEN_LAYER_NEEDS_BASE_PROMPT_RULE =
  "OPEN LAYER RULE: an open-front cardigan, wrap top, duster, or any other knit/cover-up that doesn't close over the chest must ALWAYS be paired with a base layer underneath — a tank, cami, t-shirt, blouse, or long-sleeve top, chosen for the temperature and season (light tank/cami in heat, long sleeve or a fitted knit in cold). " +
  "Never propose that kind of open layer as the only top in the outfit. If the wardrobe has no suitable base layer available, don't use that open piece at all rather than leaving it worn alone.";

/** Crystals, Swarovski, rhinestones, diamonds, sequins: a piece decorated with them is an
 *  EVENING piece. This is read from the Material field (and styleTags/subcategory as a
 *  fallback), so trousers with Swarovski, a sequinned top or a crystal clutch are recognised
 *  as such by every engine — not only when the word happens to be in the subcategory. */
export const EMBELLISHED_SIGNAL = /swarovski|crystal|cristall|rhinestone|strass|diamond|diamant|sequin|paillette|lurex/i;

const JEWELRY_SUBCATEGORIES = new Set(["earrings", "necklace", "bracelet", "ring", "brooch", "anklet", "watch"]);

/** True for a garment, shoe, bag or non-jewelry accessory that is embellished. Jewelry itself
 *  is excluded on purpose: earrings with stones are fine at any hour of the day. */
export function isEmbellishedPiece(item: {
  subcategory?: string | null; styleTags?: string[] | null; material?: string[] | null;
}): boolean {
  const sub = (item.subcategory ?? "").toLowerCase();
  if (JEWELRY_SUBCATEGORIES.has(sub)) return false;
  const text = `${sub} ${(item.styleTags ?? []).join(" ")} ${(item.material ?? []).join(" ")}`;
  return EMBELLISHED_SIGNAL.test(text);
}

const EVENING_LIKE_OCCASION = /evening|sera|serata|cocktail|gala|party|festa|wedding|matrimonio|black.?tie|formal|concert|concerto|night|club|dinner|cena/i;
const DAYTIME_BUSINESS = /work|business|lavoro|office|ufficio/i;

/** Whether an embellished piece is welcome in a look for this occasion (free text). An empty
 *  occasion is left to the prompt. A business dinner is still a business setting: no sparkle. */
export function allowsEmbellished(occasion: string | null | undefined, daySegment?: string | null): boolean {
  if (daySegment === "evening") return true;
  const o = (occasion ?? "").trim();
  if (!o) return true;
  if (DAYTIME_BUSINESS.test(o)) return false;
  return EVENING_LIKE_OCCASION.test(o);
}

export const EMBELLISHED_EVENING_PROMPT_RULE =
  "EMBELLISHED PIECES: a garment, shoe or bag decorated with crystals, Swarovski, rhinestones, diamonds or sequins (see its material and styleTags) is an EVENING piece \u2014 " +
  "trousers with Swarovski are an evening look, not an everyday one. Use it only for Evening, Formal, cocktail, party or gala looks, and never for Work, everyday, Weekend, Travel or any daytime look. " +
  "Jewelry with stones (earrings, necklace, watch, bracelet) is fine at any time of day.";
