// Wardrobe search for the stylist chat. The chat used to hand the model only part of the wardrobe
// (the first 200 pieces), so a piece the person named ("il vestito Balenciaga") could simply not be
// in what the model saw, and it answered that the piece didn't exist. This module finds, in code and
// over the WHOLE wardrobe, the pieces a message refers to — by brand, model, type, colour and
// material, in Italian, English, Spanish and French — so they are always given to the model and the
// reply can tell "found", "several possible matches, which one?" and "really not there" apart.

export type SearchableItem = {
  id: string;
  category?: string | null;
  subcategory?: string | null;
  colors?: string[] | null;
  brand?: string | null;
  model?: string | null;
  material?: string[] | null;
};

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Words (normalized, singular and plural) → wardrobe category or type. A type entry is
 *  "Category/Type"; a category entry is just the category. */
const TYPE_WORDS: Record<string, string[]> = {
  Dresses: ["dress", "dresses", "vestito", "vestiti", "abito", "abiti", "abitino", "vestido", "vestidos", "robe", "robes", "tubino"],
  Jumpsuits: ["jumpsuit", "jumpsuits", "tuta intera", "tutina", "mono", "combinaison", "salopette"],
  Tops: ["top", "tops", "blouse", "camicetta", "blusa", "maglia", "maglie", "maglietta", "camiseta", "haut", "chemisier"],
  Bottoms: ["bottom", "bottoms"],
  Outerwear: ["outerwear", "capospalla", "giacca", "giacche", "jacket", "jackets", "chaqueta"],
  Shoes: ["shoes", "shoe", "scarpe", "scarpa", "zapatos", "zapato", "chaussures", "calzature"],
  Bags: ["bag", "bags", "borsa", "borse", "borsetta", "bolso", "bolsos", "sac", "sacs", "handbag", "pochette"],
  Accessories: ["accessory", "accessories", "accessorio", "accessori", "accesorio", "accessoire", "gioiello", "gioielli", "jewelry", "jewellery", "bijoux"],
  Swimwear: ["swimwear", "costume", "costume da bagno", "swimsuit", "bañador", "maillot"],
  "Bottoms/Skirt": ["skirt", "skirts", "gonna", "gonne", "gonnellina", "falda", "faldas", "jupe", "jupes", "minigonna"],
  "Bottoms/Jeans": ["jeans", "denim", "vaqueros"],
  "Bottoms/Trousers": ["trousers", "pants", "pantaloni", "pantalone", "pantalon", "pantalones", "chino", "chinos"],
  "Bottoms/Cargo Pants": ["cargo", "cargo pants", "pantaloni cargo"],
  "Bottoms/Shorts": ["shorts", "pantaloncini"],
  "Tops/Shirt": ["shirt", "camicia", "camicie", "camisa", "chemise"],
  "Tops/T-Shirt": ["t shirt", "tshirt", "tee", "maglietta"],
  "Tops/Sweater": ["sweater", "jumper", "maglione", "maglioni", "jersey", "pullover"],
  "Tops/Cardigan": ["cardigan"],
  "Tops/Tank Top": ["tank", "tank top", "canotta", "canottiera", "debardeur"],
  "Tops/Bodysuit": ["bodysuit"],
  "Outerwear/Blazer": ["blazer", "giacca blazer"],
  "Outerwear/Coat": ["coat", "cappotto", "cappotti", "abrigo", "manteau"],
  "Outerwear/Trench Coat": ["trench"],
  "Outerwear/Leather Jacket": ["chiodo", "giacca di pelle", "leather jacket", "perfecto"],
  "Outerwear/Puffer Jacket": ["piumino", "puffer", "doudoune"],
  "Shoes/Sneakers": ["sneakers", "sneaker", "scarpe da ginnastica", "zapatillas", "baskets"],
  "Shoes/Sandals": ["sandals", "sandali", "sandalo", "sandalias", "sandales"],
  "Shoes/Pumps": ["pumps", "decollete", "decolletes", "tacchi", "heels", "tacones", "escarpins"],
  "Shoes/Boots": ["boots", "stivali", "stivale", "botas", "bottes"],
  "Shoes/Ankle Boots": ["ankle boots", "stivaletti", "tronchetti", "botines", "bottines"],
  "Shoes/Loafers": ["loafers", "mocassini", "mocassino", "mocasines", "mocassins"],
  "Shoes/Flats": ["flats", "ballerine", "ballerina", "bailarinas", "ballerines"],
  "Shoes/Mules": ["mules", "sabot"],
  "Bags/Clutch": ["clutch", "pochette"],
  "Bags/Tote": ["tote", "shopper", "shopping bag"],
  "Bags/Crossbody": ["crossbody", "tracolla"],
  "Bags/Backpack": ["backpack", "zaino", "mochila", "sac a dos"],
  "Accessories/Belt": ["belt", "cintura", "cinturon", "ceinture"],
  "Accessories/Scarf": ["scarf", "sciarpa", "foulard", "bufanda", "echarpe"],
  "Accessories/Sunglasses": ["sunglasses", "occhiali da sole", "occhiali", "gafas de sol", "lunettes de soleil"],
  "Accessories/Earrings": ["earrings", "orecchini", "pendientes", "boucles d oreilles"],
  "Accessories/Necklace": ["necklace", "collana", "collar", "collier"],
  "Accessories/Bracelet": ["bracelet", "bracciale", "pulsera"],
  "Accessories/Watch": ["watch", "orologio", "reloj", "montre"],
};

/** Colour words → substrings that identify the colour in the stored colour names (which are
 *  English, sometimes with a shade, e.g. "Jet Black", "Powder Pink", "Navy"). */
const COLOR_WORDS: Record<string, string[]> = {
  black: ["black", "nero", "nera", "neri", "nere", "negro", "negra", "noir", "noire"],
  white: ["white", "bianco", "bianca", "bianchi", "bianche", "blanco", "blanca", "blanc", "blanche"],
  red: ["red", "rosso", "rossa", "rossi", "rosse", "rojo", "roja", "rouge"],
  blue: ["blue", "blu", "azzurro", "azzurra", "azul", "bleu", "navy"],
  navy: ["navy", "blu navy", "blu scuro", "marine"],
  green: ["green", "verde", "verdi", "vert", "verte", "olive", "oliva"],
  pink: ["pink", "rosa", "rose"],
  beige: ["beige", "nude", "sabbia", "sand", "camel", "cammello", "cream", "panna", "crema", "ivory", "avorio"],
  brown: ["brown", "marrone", "marroni", "marron", "cioccolato", "chocolate", "tan", "cuoio", "cognac"],
  grey: ["grey", "gray", "grigio", "grigia", "grigi", "gris"],
  yellow: ["yellow", "giallo", "gialla", "amarillo", "jaune"],
  orange: ["orange", "arancione", "arancio", "naranja"],
  purple: ["purple", "viola", "lilla", "lilac", "lavender", "lavanda", "morado", "violet"],
  gold: ["gold", "oro", "dorato", "dorata", "dore"],
  silver: ["silver", "argento", "argentato", "plata", "argent"],
  burgundy: ["burgundy", "bordeaux", "vinaccia", "wine"],
};
const COLOR_STORED: Record<string, string[]> = {
  black: ["black", "noir", "jet"], white: ["white", "ivory", "off white"], red: ["red", "scarlet", "crimson"],
  blue: ["blue", "navy", "cobalt", "azure", "denim", "sky"], navy: ["navy"], green: ["green", "olive", "emerald", "sage", "khaki", "forest"],
  pink: ["pink", "rose", "blush", "fuchsia", "magenta"], beige: ["beige", "nude", "sand", "camel", "cream", "ivory", "ecru", "taupe"],
  brown: ["brown", "chocolate", "tan", "cognac", "caramel", "mocha", "taupe"], grey: ["grey", "gray", "charcoal", "silver"],
  yellow: ["yellow", "mustard", "lemon"], orange: ["orange", "rust", "terracotta", "coral"], purple: ["purple", "violet", "lilac", "lavender", "plum"],
  gold: ["gold"], silver: ["silver"], burgundy: ["burgundy", "bordeaux", "wine", "maroon", "oxblood"],
};

const MATERIAL_WORDS: Record<string, string[]> = {
  leather: ["leather", "pelle", "cuoio", "cuero", "cuir"], silk: ["silk", "seta", "seda", "soie"], wool: ["wool", "lana", "laine"],
  cashmere: ["cashmere", "cachemire"], linen: ["linen", "lino", "lin"], cotton: ["cotton", "cotone", "algodon", "coton"],
  denim: ["denim", "jeans"], suede: ["suede", "camoscio", "daim"], velvet: ["velvet", "velluto", "terciopelo", "velours"],
  sequins: ["sequins", "paillettes", "lustrini", "lentejuelas"], satin: ["satin", "raso", "saten"],
};

function hasPhrase(haystack: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (!p) return false;
  return ` ${haystack} `.includes(` ${p} `);
}

const NEGATION_BEFORE = /\b(non|no|senza|without|not|sin|sans|pas|niente|evita|avoid)\s+(?:\S+\s+){0,3}$/;

export type WardrobeSearchResult<T> = {
  /** True when the message refers to pieces in a searchable way (a brand, a type, a model). */
  isPieceQuery: boolean;
  /** Pieces that fit everything the message says about them, best first. */
  matches: T[];
  /** A brand named in the message, or null. */
  brand: string | null;
  /** The message says NOT to use the matched piece(s) ("senza il vestito Balenciaga"). */
  negated: boolean;
};

/** Finds the wardrobe pieces a message refers to. A piece matches when it agrees with EVERY kind of
 *  detail the message gives (brand, type, colour, material — each only when mentioned); a model name
 *  on its own also identifies a piece. */
export function searchWardrobe<T extends SearchableItem>(message: string, items: T[]): WardrobeSearchResult<T> {
  const text = normalizeText(message);
  if (!text) return { isPieceQuery: false, matches: [], brand: null, negated: false };

  const brands = [...new Set(items.map((it) => it.brand?.trim()).filter((b): b is string => Boolean(b) && normalizeText(b!).length >= 3))];
  const brandHits = brands.filter((b) => hasPhrase(text, b));
  // Longest brand wins ("Saint Laurent" over "Laurent")
  const brand = brandHits.sort((a, b) => b.length - a.length)[0] ?? null;

  const typeHits = Object.entries(TYPE_WORDS).filter(([, words]) => words.some((w) => hasPhrase(text, w))).map(([k]) => k);
  // A more specific type ("Bottoms/Skirt") makes its bare category redundant.
  const typeKeys = typeHits.filter((k) => k.includes("/") || !typeHits.some((o) => o.startsWith(`${k}/`)));
  const colorHits = Object.entries(COLOR_WORDS).filter(([, words]) => words.some((w) => hasPhrase(text, w))).map(([k]) => k);
  const materialHits = Object.entries(MATERIAL_WORDS).filter(([, words]) => words.some((w) => hasPhrase(text, w))).map(([k]) => k);

  const modelHit = (it: T): boolean => {
    const m = normalizeText(it.model ?? "");
    return m.length >= 4 && hasPhrase(text, m);
  };

  const isPieceQuery = Boolean(brand) || typeKeys.length > 0 || items.some(modelHit);
  if (!isPieceQuery) return { isPieceQuery: false, matches: [], brand: null, negated: false };

  const typeOk = (it: T): boolean => {
    if (!typeKeys.length) return true;
    return typeKeys.some((k) => {
      const [cat, sub] = k.split("/");
      if (it.category !== cat) return false;
      return !sub || normalizeText(it.subcategory ?? "") === normalizeText(sub);
    });
  };
  const colorOk = (it: T): boolean => {
    if (!colorHits.length) return true;
    const stored = normalizeText((it.colors ?? []).join(" "));
    if (!stored) return true; // unknown colour never rules a piece out
    return colorHits.some((c) => (COLOR_STORED[c] ?? [c]).some((s) => hasPhrase(stored, s) || stored.includes(s)));
  };
  const materialOk = (it: T): boolean => {
    if (!materialHits.length) return true;
    const stored = normalizeText((it.material ?? []).join(" "));
    if (!stored) return true;
    return materialHits.some((m) => stored.includes(m) || (MATERIAL_WORDS[m] ?? []).some((w) => stored.includes(normalizeText(w))));
  };

  const scored = items
    .map((it) => {
      if (modelHit(it)) return { it, score: 10 };
      if (brand && normalizeText(it.brand ?? "") !== normalizeText(brand)) return null;
      // A colour or material alone ("qualcosa di nero") is not a piece query: brand or type needed.
      if (!brand && !typeKeys.length) return null;
      if (!typeOk(it) || !colorOk(it) || !materialOk(it)) return null;
      const score = (brand ? 5 : 0) + (typeKeys.length ? 2 : 0) + (colorHits.length && (it.colors ?? []).length ? 1 : 0);
      return { it, score };
    })
    .filter((x): x is { it: T; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);

  // "senza il vestito Balenciaga", "non voglio la gonna nera": the named piece is to be avoided.
  const anchorWord = brand ?? TYPE_WORDS[typeKeys[0] ?? ""]?.find((w) => hasPhrase(text, w)) ?? "";
  const idx = anchorWord ? ` ${text} `.indexOf(` ${normalizeText(anchorWord)} `) : -1;
  const negated = idx > 0 && NEGATION_BEFORE.test(` ${text} `.slice(0, idx + 1).replace(/\b(il|lo|la|i|gli|le|un|una|the|a|el|los|las|le|les|du|des)\s+$/, ""));

  return { isPieceQuery, matches: scored.map((x) => x.it), brand, negated };
}

/** Short identifying label for a piece: brand · colour · type (· model). */
export function pieceLabel(it: SearchableItem): string {
  return [it.brand, (it.colors ?? [])[0], it.subcategory || it.category, it.model].filter(Boolean).join(" · ");
}

/** English words a single search word stands for ("lino" → linen, "nera" → black and its shades),
 *  for simple text filters over stored (English) values. */
export function expandSearchWord(word: string): string[] {
  const w = normalizeText(word);
  if (!w) return [];
  const out = new Set<string>([w]);
  for (const [k, words] of Object.entries(COLOR_WORDS)) if (words.some((x) => normalizeText(x) === w)) (COLOR_STORED[k] ?? [k]).forEach((s) => out.add(s));
  for (const [k, words] of Object.entries(MATERIAL_WORDS)) if (words.some((x) => normalizeText(x) === w)) out.add(k);
  for (const [k, words] of Object.entries(TYPE_WORDS)) if (words.some((x) => normalizeText(x) === w)) k.split("/").forEach((s) => out.add(normalizeText(s)));
  return [...out];
}
