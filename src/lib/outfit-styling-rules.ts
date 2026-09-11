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
