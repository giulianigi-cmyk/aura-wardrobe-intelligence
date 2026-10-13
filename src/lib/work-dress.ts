// Work dress, shared by the outfit engine (ai-suggest-outfit.functions.ts) and the trip planner
// (trip-capsule.server.ts):
//  - a logo or graphic T-shirt/sweatshirt is never a work piece, even at a casual office;
//  - a trip activity is a work day when its name or dress code says so (a trade fair, a meeting,
//    a conference, "Business Casual"), not only when the occasion is literally "Work".

export type LogoCheckable = {
  category?: string | null;
  subcategory?: string | null;
  styleTags?: string[] | null;
  details?: string[] | null;
};

// The casual knit tops a print or a big logo goes on. A shirt, blouse or polo with a small
// embroidered logo stays a normal work piece.
const CASUAL_KNIT_TOP = /t-?shirt|\btee\b|sweatshirt|hoodie|felpa|maglietta|tank|canott/i;
const LOGO_OR_GRAPHIC = /logo|monogram|graphic|grafic|slogan|lettering|scritt|stampa|print/i;

/** A T-shirt, sweatshirt, hoodie or tank with a logo, a slogan or a graphic print. */
export function isLogoOrGraphicTop(it: LogoCheckable): boolean {
  if (it.category !== "Tops" || !CASUAL_KNIT_TOP.test(it.subcategory ?? "")) return false;
  if ((it.details ?? []).includes("logo")) return true;
  return LOGO_OR_GRAPHIC.test(`${it.subcategory ?? ""} ${(it.styleTags ?? []).join(" ")}`);
}

// Words in it/en/es/fr/de that make an activity a working one.
// Letter-aware boundaries (not \b), so accented words like "reunión" and "réunion" match too.
const WORK_SIGNAL = /(?<!\p{L})(work|working|business|lavoro|ufficio|office|meeting|riunion\p{L}*|conferen\p{L}*|congress\p{L}*|convention|fiera|fiere|trade ?fair|trade ?show|messe|expo|summit|semina\p{L}*|workshop|clienti?|clients?|trabajo|reuni[oó]n|feria|travail|r[ée]union|salon professionnel|arbeit)(?!\p{L})/iu;

/** A work activity, read from its name and dress code ("Gimav con Barbara" + "Business Casual",
 *  "Riunione clienti", "Trade fair"). */
export function isWorkActivityText(label: string | null | undefined, dressCode?: string | null): boolean {
  return WORK_SIGNAL.test(`${label ?? ""} ${dressCode ?? ""}`);
}
