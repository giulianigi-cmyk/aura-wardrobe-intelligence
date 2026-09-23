// Structured place → dress-requirement model, replacing a flat "place of worship" keyword check
// with the fuller hierarchy the person actually wants: LUOGO → TIPO DI DRESS CODE →
// LIVELLO DI OBBLIGATORIETÀ → CONTESTO. Kept as its own module (sibling to activity-kind.ts)
// because it is a genuinely different axis — activity-kind.ts answers "what KIND of occasion is
// this" (a concert, a business dinner…) to shape STYLE; this module answers "does the VENUE
// itself impose an access/etiquette requirement", independent of the traveler's own occasion or
// of any opt-in cultural preference (see outfit-styling-rules.ts's cultural-mode toggle, which
// stays entirely separate — this module never reads it and is never gated by it).
//
// Every requirement type the person listed is represented in DressRequirementType, even the ones
// AURA's wardrobe schema has no attribute to check (a head covering, shoe removal, transparency,
// a specific neckline). Only the subset that maps to a real, existing item attribute is ever
// turned into a hard exclusion below (see ENFORCEABLE_REQUIREMENTS); the rest surface as a short
// advisory note on the outfit instead of being silently dropped or, worse, silently pretended to
// be enforced.

export type DressRequirementType =
  | "cover_shoulders" | "cover_knees" | "cover_legs" | "cover_arms"
  | "cover_head" | "cover_hair"
  | "avoid_low_neckline" | "avoid_sheer" | "avoid_tight" | "no_shorts" | "remove_shoes"
  | "formal_attire" | "business_formal" | "cocktail" | "black_tie" | "traditional_attire"
  | "gender_specific" | "area_specific";

/** Requirement types AURA can actually check against a wardrobe item's real attributes
 *  (subcategory, length, sleeveLength, fit, formality). Everything else in
 *  DressRequirementType is data-complete but advisory-only — see advisoryNoteFor(). */
const ENFORCEABLE_REQUIREMENTS = new Set<DressRequirementType>([
  "cover_shoulders", "cover_knees", "cover_legs", "cover_arms", "avoid_tight", "no_shorts",
  "formal_attire", "business_formal", "cocktail", "black_tie",
]);

export type ObligationLevel = "mandatory" | "strongly_recommended" | "recommended" | "culturally_appropriate";

/** Whether an obligation level is firm enough to hard-exclude items over, vs. only nudge scoring.
 *  Mirrors the person's own distinction: "obbligatorio"/"fortemente consigliato" (a mosque, an
 *  embassy) behave as real constraints; "consigliato"/"culturalmente appropriato" (a museum, a
 *  historic site — explicitly NOT the same as a place of worship) are a soft preference only. */
export function isHardObligation(level: ObligationLevel): boolean {
  return level === "mandatory" || level === "strongly_recommended";
}

export type PlaceProfile = {
  id: string;
  category:
    | "sacred_religious" | "diplomatic_institutional" | "high_formality_social"
    | "formal_venue" | "cultural_heritage" | "professional_institutional";
  keywords: string[];
  requirements: DressRequirementType[];
  obligation: ObligationLevel;
  /** Minimum formality (1-5 scale, see the Outfit Engine doc) this place calls for, when the
   *  category's requirement is about formality rather than coverage. */
  minFormality?: number;
};

// Longest/most specific keyword phrases are matched first inside detectPlaceContext, so "tempio
// ebraico" wins over the bare "tempio" it also contains — order within each keywords array
// doesn't matter for that (matching sorts by phrase length globally), only which PROFILE a phrase
// belongs to matters here.

export const PLACE_PROFILES: PlaceProfile[] = [
  {
    id: "sacred_religious",
    category: "sacred_religious",
    keywords: [
      // Italiano
      "moschea", "chiesa", "basilica", "cattedrale", "duomo", "santuario", "cappella", "convento",
      "monastero", "abbazia", "sinagoga", "tempio ebraico", "tempio induista", "tempio buddhista",
      "tempio sikh", "gurdwara", "tempio jainista", "tempio shintoista", "pagoda", "stupa", "ashram",
      "mandir", "gurudwara", "zawiya", "zāwiya", "dargah", "santuario islamico",
      "luogo di pellegrinaggio", "sito religioso", "cimitero religioso", "sacrario", "memoriale religioso",
      "tempio",
      // English
      "mosque", "church", "cathedral", "shrine", "chapel", "convent", "monastery", "abbey",
      "synagogue", "gurdwara", "pagoda", "stupa", "ashram", "mandir", "pilgrimage site",
      "place of worship", "religious site", "temple",
      // Español
      "mezquita", "iglesia", "basílica", "catedral", "capilla", "monasterio", "sinagoga",
      "templo judío", "templo hindú", "templo budista", "templo sij", "templo jainista",
      "templo sintoísta", "santuario islámico", "lugar de peregrinación", "cementerio religioso",
      "monumento conmemorativo religioso", "templo",
      // Français
      "mosquée", "église", "basilique", "cathédrale", "chapelle", "couvent", "monastère",
      "synagogue", "temple juif", "temple hindou", "temple bouddhiste", "temple sikh",
      "temple jaïn", "temple shintoïste", "zaouïa", "sanctuaire islamique", "lieu de pèlerinage",
      "site religieux", "cimetière religieux", "mémorial religieux", "temple",
    ],
    requirements: ["cover_shoulders", "cover_knees", "cover_legs", "avoid_tight", "no_shorts", "cover_head", "cover_hair", "remove_shoes", "avoid_low_neckline"],
    obligation: "mandatory",
  },
  {
    id: "diplomatic_institutional",
    category: "diplomatic_institutional",
    keywords: [
      "ambasciata", "consolato", "residenza dell'ambasciatore", "residenza diplomatica",
      "missione diplomatica", "missione permanente", "rappresentanza diplomatica",
      "organizzazione internazionale", "sede onu", "istituzione europea", "parlamento",
      "palazzo presidenziale", "residenza presidenziale", "palazzo reale", "corte reale",
      "residenza reale", "ministero", "palazzo governativo", "ufficio governativo", "prefettura",
      "municipio", "comune", "tribunale", "corte di giustizia", "corte suprema",
      "camera di commercio", "istituzione pubblica",
      "embassy", "consulate", "ambassador's residence", "diplomatic mission", "united nations",
      "parliament", "presidential palace", "royal palace", "ministry", "city hall", "courthouse",
      "supreme court",
      // Español
      "embajada", "consulado", "residencia del embajador", "residencia diplomática",
      "misión diplomática", "misión permanente", "representación diplomática",
      "organización internacional", "sede de la onu", "institución europea", "parlamento",
      "palacio presidencial", "residencia presidencial", "palacio real", "corte real",
      "residencia real", "ministerio", "palacio gubernamental", "oficina gubernamental",
      "prefectura", "ayuntamiento", "tribunal", "corte de justicia", "corte suprema",
      "cámara de comercio", "institución pública",
      // Français
      "ambassade", "consulat", "résidence de l'ambassadeur", "résidence diplomatique",
      "mission diplomatique", "mission permanente", "représentation diplomatique",
      "organisation internationale", "siège de l'onu", "institution européenne", "parlement",
      "palais présidentiel", "résidence présidentielle", "palais royal", "cour royale",
      "résidence royale", "ministère", "palais gouvernemental", "bureau gouvernemental",
      "préfecture", "mairie", "tribunal", "cour de justice", "cour suprême",
      "chambre de commerce", "institution publique",
    ],
    requirements: ["business_formal", "no_shorts", "cover_knees", "avoid_tight"],
    obligation: "strongly_recommended",
    minFormality: 4,
  },
  {
    id: "high_formality_social",
    category: "high_formality_social",
    keywords: [
      "ricevimento diplomatico", "cena diplomatica", "pranzo istituzionale", "cena istituzionale",
      "ricevimento ufficiale", "cerimonia ufficiale", "cerimonia di stato", "evento governativo",
      "incontro con autorità", "incontro con rappresentanti istituzionali", "visita ufficiale",
      "visita di stato", "conferenza diplomatica", "vertice internazionale", "meeting istituzionale",
      "evento presso ambasciata", "evento presso consolato", "cena presso residenza diplomatica",
      "diplomatic reception", "state dinner", "state ceremony", "official visit", "summit",
      // Español
      "recepción diplomática", "cena diplomática", "almuerzo institucional", "cena institucional",
      "recepción oficial", "ceremonia oficial", "ceremonia de estado", "evento gubernamental",
      "encuentro con autoridades", "encuentro con representantes institucionales",
      "visita oficial", "visita de estado", "conferencia diplomática", "cumbre internacional",
      "reunión institucional", "evento en la embajada", "evento en el consulado",
      "cena en residencia diplomática",
      // Français
      "réception diplomatique", "dîner diplomatique", "déjeuner institutionnel",
      "dîner institutionnel", "réception officielle", "cérémonie officielle",
      "cérémonie d'état", "événement gouvernemental", "rencontre avec des autorités",
      "rencontre avec des représentants institutionnels", "visite officielle", "visite d'état",
      "conférence diplomatique", "sommet international", "réunion institutionnelle",
      "événement à l'ambassade", "événement au consulat", "dîner à la résidence diplomatique",
    ],
    requirements: ["business_formal", "no_shorts", "cover_knees"],
    obligation: "strongly_recommended",
    minFormality: 4,
  },
  {
    id: "formal_venue",
    category: "formal_venue",
    keywords: [
      "teatro dell'opera", "opera", "teatro", "sala da concerto", "concerto classico", "gala",
      "ballo di gala", "evento black tie", "black tie", "white tie", "cocktail istituzionale",
      "cerimonia di premiazione", "evento benefico", "charity gala", "cena di rappresentanza",
      "club privato", "country club", "royal club", "yacht club", "circolo esclusivo",
      "opera house", "concert hall", "classical concert",
      // Español
      "teatro de la ópera", "ópera", "teatro", "sala de conciertos", "concierto clásico", "gala",
      "baile de gala", "evento de etiqueta", "cóctel institucional", "ceremonia de premiación",
      "evento benéfico", "cena de representación", "club privado", "club de campo",
      "club náutico", "círculo exclusivo",
      // Français
      "opéra", "théâtre", "salle de concert", "concert classique", "bal de gala",
      "soirée de gala", "cocktail institutionnel", "cérémonie de remise de prix",
      "événement caritatif", "dîner de gala", "club privé", "club nautique", "cercle exclusif",
    ],
    requirements: ["formal_attire", "no_shorts", "cover_knees"],
    obligation: "strongly_recommended",
    minFormality: 4,
  },
  {
    id: "cultural_heritage",
    category: "cultural_heritage",
    keywords: [
      "sito storico", "sito archeologico", "museo", "museo religioso", "mausoleo",
      "monumento nazionale", "sito unesco", "villaggio tradizionale", "comunità tradizionale",
      "area tribale", "luogo sacro", "santuario naturale", "cimitero", "memoriale",
      "sito commemorativo", "area governativa", "distretto diplomatico",
      "historic site", "archaeological site", "museum", "mausoleum", "unesco site",
      "traditional village", "sacred site", "memorial", "cemetery",
      // Español
      "sitio histórico", "sitio arqueológico", "museo", "museo religioso", "mausoleo",
      "monumento nacional", "sitio unesco", "pueblo tradicional", "comunidad tradicional",
      "área tribal", "lugar sagrado", "santuario natural", "cementerio", "memorial",
      "sitio conmemorativo", "área gubernamental", "distrito diplomático",
      // Français
      "site historique", "site archéologique", "musée", "musée religieux", "mausolée",
      "monument national", "site unesco", "village traditionnel", "communauté traditionnelle",
      "zone tribale", "lieu sacré", "sanctuaire naturel", "cimetière", "mémorial",
      "site commémoratif", "zone gouvernementale", "quartier diplomatique",
    ],
    // Deliberately NOT the same as sacred_religious — the person's own distinction: a museum or
    // historic site calls for cultural respect as a soft preference, never a hard requirement the
    // way an active place of worship does.
    requirements: ["cover_shoulders", "cover_knees", "avoid_tight"],
    obligation: "culturally_appropriate",
  },
  {
    id: "professional_institutional",
    category: "professional_institutional",
    keywords: [
      "meeting con ambasciatore", "meeting diplomatico", "consiglio di amministrazione",
      "assemblea societaria", "congresso", "convegno", "udienza", "audizione",
      "board meeting", "shareholder meeting",
      // Español
      "reunión con embajador", "reunión con el embajador", "reunión diplomática", "consejo de administración",
      "junta de accionistas", "congreso", "convención", "audiencia",
      // Français
      "réunion avec l'ambassadeur", "réunion diplomatique", "conseil d'administration",
      "assemblée générale", "congrès", "colloque", "audience",
    ],
    // Client meetings, ordinary conferences, business/work dinners and job interviews are left to
    // activity-kind.ts's existing "business_dinner"/Work handling on purpose — this profile only
    // covers the more distinctly institutional subset that isn't already recognized there.
    requirements: ["business_formal", "no_shorts"],
    obligation: "recommended",
    minFormality: 4,
  },
];

// Matching sorts candidate keywords by length (longest/most specific first) across ALL profiles
// together, so a compound phrase like "tempio ebraico" is tested before the bare "tempio" that a
// different (or the same) profile also lists — whichever profile owns the longest match wins.
const ALL_KEYWORD_ENTRIES: { keyword: string; profile: PlaceProfile }[] = PLACE_PROFILES.flatMap((profile) =>
  profile.keywords.map((keyword) => ({ keyword: keyword.toLowerCase(), profile })),
).sort((a, b) => b.keyword.length - a.keyword.length);

/** Detects which (if any) place profile a free-text label/location matches. Returns the single
 *  best (longest-phrase) match; a label is expected to belong to at most one profile in practice. */
export function detectPlaceContext(label: string | null | undefined): PlaceProfile | null {
  const text = `${label ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  const hit = ALL_KEYWORD_ENTRIES.find((e) => text.includes(e.keyword));
  return hit?.profile ?? null;
}

/** Human-readable, short advisory line for requirements this profile lists that AURA's wardrobe
 *  schema has no attribute to check (a head covering, removing shoes, avoiding transparency…).
 *  Returned so the outfit's own explanation can mention it rather than silently dropping it —
 *  never enforced, since AURA has nothing to verify it against. Null when every requirement of
 *  this profile is already enforced in code (nothing left worth a separate note). */
export function advisoryNoteFor(profile: PlaceProfile): string | null {
  const advisory = profile.requirements.filter((r) => !ENFORCEABLE_REQUIREMENTS.has(r));
  if (!advisory.length) return null;
  const LABELS: Partial<Record<DressRequirementType, string>> = {
    cover_head: "copricapo",
    cover_hair: "capelli coperti",
    avoid_low_neckline: "evitare scollature",
    avoid_sheer: "evitare trasparenze",
    remove_shoes: "togliere le scarpe all'ingresso",
    traditional_attire: "abbigliamento tradizionale",
    gender_specific: "regole diverse per genere",
    area_specific: "regole diverse a seconda dell'area della struttura",
  };
  const parts = advisory.map((r) => LABELS[r]).filter((x): x is string => Boolean(x));
  if (!parts.length) return null;
  return `Questo luogo può richiedere anche: ${parts.join(", ")}.`;
}
