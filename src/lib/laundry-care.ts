/**
 * Come lavare i capi: the "Come lavarlo" box at the bottom of every piece (picked from its materials and
 * category) and the Guida al lavaggio sheet (care-label symbols, washing-machine programmes, general tips).
 *
 * Advice is general and follows the usual care-label conventions (ISO 3758 symbols); the piece's own label
 * always wins, and every box says so.
 */

export type CareSymbolKind =
  | "wash-30" | "wash-40" | "wash-60" | "wash-30-gentle" | "wash-40-gentle" | "wash-30-very-gentle" | "wash-hand" | "wash-no"
  | "bleach-any" | "bleach-oxygen" | "bleach-no"
  | "tumble-normal" | "tumble-low" | "tumble-no" | "dry-line" | "dry-flat" | "dry-drip" | "dry-shade"
  | "iron-3" | "iron-2" | "iron-1" | "iron-no"
  | "dryclean-P" | "dryclean-F" | "dryclean-W" | "dryclean-no";

export type CareProfileId =
  | "leather" | "hard" | "shoes" | "bag" | "swim" | "embellished" | "velvet" | "silk" | "down" | "wool"
  | "viscose" | "synthetic" | "linen" | "denim" | "cotton";

export type CareExtraId = "bra" | "activewear" | "hosiery";

export type SymbolGroupId = "wash" | "bleach" | "dry" | "iron" | "dryclean";

export const SYMBOL_GROUPS: { id: SymbolGroupId; symbols: CareSymbolKind[] }[] = [
  { id: "wash", symbols: ["wash-30", "wash-40", "wash-60", "wash-30-gentle", "wash-40-gentle", "wash-30-very-gentle", "wash-hand", "wash-no"] },
  { id: "bleach", symbols: ["bleach-any", "bleach-oxygen", "bleach-no"] },
  { id: "dry", symbols: ["tumble-normal", "tumble-low", "tumble-no", "dry-line", "dry-flat", "dry-drip", "dry-shade"] },
  { id: "iron", symbols: ["iron-3", "iron-2", "iron-1", "iron-no"] },
  { id: "dryclean", symbols: ["dryclean-P", "dryclean-F", "dryclean-W", "dryclean-no"] },
];

/** The symbols shown in a piece's box: what its label most likely says. Metal and jewellery have none. */
export const PROFILE_SYMBOLS: Record<CareProfileId, CareSymbolKind[]> = {
  leather: ["wash-no", "bleach-no", "tumble-no", "iron-no", "dryclean-P"],
  hard: [],
  shoes: ["wash-30-very-gentle", "bleach-no", "tumble-no", "iron-no"],
  bag: ["wash-no", "bleach-no", "tumble-no", "iron-no"],
  swim: ["wash-hand", "bleach-no", "tumble-no", "dry-shade", "iron-no"],
  embellished: ["wash-hand", "bleach-no", "tumble-no", "iron-no", "dryclean-P"],
  velvet: ["wash-hand", "bleach-no", "tumble-no", "iron-no", "dryclean-P"],
  silk: ["wash-hand", "bleach-no", "tumble-no", "dry-shade", "iron-1"],
  down: ["wash-30-gentle", "bleach-no", "tumble-low", "iron-no"],
  wool: ["wash-30-very-gentle", "bleach-no", "tumble-no", "dry-flat", "iron-1"],
  viscose: ["wash-30-gentle", "bleach-no", "tumble-no", "dry-line", "iron-2"],
  synthetic: ["wash-40-gentle", "bleach-oxygen", "tumble-low", "iron-1"],
  linen: ["wash-40", "bleach-oxygen", "tumble-no", "dry-line", "iron-3"],
  denim: ["wash-30", "bleach-no", "tumble-low", "iron-2"],
  cotton: ["wash-40", "bleach-oxygen", "tumble-normal", "iron-3"],
};

const LEATHER = new Set(["Leather", "Suede", "Shearling"]);
/** Not textile: metal, stones, rubber. A piece made only of these is not washed at all. */
const HARD = new Set(["Metal", "Gold", "Silver", "Steel", "Brass", "Pearl", "Rubber", "Diamonds"]);
const EMBELLISHED = new Set(["Sequins", "Swarovski", "Crystals", "Rhinestones"]);
/** Textile families, most delicate first: a mix is washed like its most delicate fibre. */
const TEXTILE_ORDER: [CareProfileId, string[]][] = [
  ["velvet", ["Velvet"]],
  ["silk", ["Silk"]],
  ["down", ["Down"]],
  ["wool", ["Wool", "Merino", "Cashmere", "Mohair", "Alpaca"]],
  ["viscose", ["Viscose", "Modal", "Lyocell", "Cupro"]],
  ["synthetic", ["Polyester", "Polyamide", "Elastane", "Acrylic", "Synthetic"]],
  ["linen", ["Linen"]],
  ["denim", ["Denim"]],
  ["cotton", ["Cotton", "Canvas"]],
];

/** How a piece is washed, from its materials and category; null when there is nothing to go on yet. */
export function careProfileFor(materials: readonly string[], category?: string | null): CareProfileId | null {
  const m = new Set(materials);
  if ([...m].some((x) => LEATHER.has(x))) return "leather";
  const textile = [...m].filter((x) => !HARD.has(x) && !EMBELLISHED.has(x));
  if (m.size > 0 && textile.length === 0 && [...m].every((x) => HARD.has(x))) return "hard";
  if (category === "Shoes") return "shoes";
  if (category === "Bags") return "bag";
  if (category === "Accessories" && textile.length === 0 && m.size > 0) return "hard";
  if (category === "Swimwear") return "swim";
  if ([...m].some((x) => EMBELLISHED.has(x))) return "embellished";
  for (const [id, family] of TEXTILE_ORDER) if (family.some((f) => m.has(f))) return id;
  return null;
}

/** Extra lines for pieces that need special care whatever they are made of. */
export function careExtrasFor(category?: string | null, subcategory?: string | null): CareExtraId[] {
  const extras: CareExtraId[] = [];
  if (subcategory === "Bra" || subcategory === "Sports Bra") extras.push("bra");
  if (category === "Activewear" || subcategory === "Sports Bra") extras.push("activewear");
  if (subcategory === "Tights" || subcategory === "Socks") extras.push("hosiery");
  return extras;
}

export type LaundryText = {
  title: string;
  intro: string;
  careBoxEmpty: string;
  /** Heading above the label symbols shown in a piece, to compare with the real label. */
  symbolsTitle: string;
  /** Small print under a piece's advice: general guidance from the materials typed in, not a guarantee. */
  disclaimer: string;
  openGuide: string;
  groupTitles: Record<SymbolGroupId, string>;
  symbolLabels: Record<CareSymbolKind, string>;
  profiles: Record<CareProfileId, { name: string; lines: string[] }>;
  extras: Record<CareExtraId, string>;
  programmesTitle: string;
  programmes: { name: string; use: string }[];
  tipsTitle: string;
  tips: string[];
};

const IT: LaundryText = {
  title: "Guida al lavaggio",
  intro: "Cosa significano i simboli dell'etichetta e quale programma della lavatrice scegliere per ogni tessuto.",
  careBoxEmpty: "Aggiungi il materiale per vedere come lavarlo.",
  symbolsTitle: "Simboli di riferimento da confrontare con l'etichetta",
  disclaimer: "Indicazioni generali basate sui materiali che hai inserito: non vediamo il capo, quindi non possiamo garantire il risultato del lavaggio. Prima di lavarlo controlla sempre l'etichetta, che vale più di questi consigli.",
  openGuide: "Simboli dell'etichetta e programmi della lavatrice",
  groupTitles: { wash: "Lavaggio", bleach: "Candeggio", dry: "Asciugatura", iron: "Stiro", dryclean: "Lavaggio professionale" },
  symbolLabels: {
    "wash-30": "Lavatrice fino a 30°",
    "wash-40": "Lavatrice fino a 40°",
    "wash-60": "Lavatrice fino a 60°",
    "wash-30-gentle": "Programma delicato fino a 30° (una linea sotto)",
    "wash-40-gentle": "Programma delicato fino a 40° (una linea sotto)",
    "wash-30-very-gentle": "Programma molto delicato fino a 30°, come lana o seta (due linee sotto)",
    "wash-hand": "Solo lavaggio a mano, in acqua tiepida",
    "wash-no": "Non lavare in acqua",
    "bleach-any": "Si può usare la candeggina",
    "bleach-oxygen": "Solo candeggianti senza cloro, all'ossigeno",
    "bleach-no": "Non candeggiare",
    "tumble-normal": "Asciugatrice a temperatura normale (due punti)",
    "tumble-low": "Asciugatrice a bassa temperatura (un punto)",
    "tumble-no": "Non usare l'asciugatrice",
    "dry-line": "Asciugare appeso",
    "dry-flat": "Asciugare in piano",
    "dry-drip": "Asciugare appeso senza strizzare, lasciandolo sgocciolare",
    "dry-shade": "Asciugare all'ombra",
    "iron-3": "Ferro ad alta temperatura, fino a 200° (tre punti)",
    "iron-2": "Ferro a temperatura media, fino a 150° (due punti)",
    "iron-1": "Ferro a bassa temperatura, fino a 110°, senza vapore (un punto)",
    "iron-no": "Non stirare",
    "dryclean-P": "Lavaggio a secco in lavanderia (P)",
    "dryclean-F": "Lavaggio a secco delicato in lavanderia (F)",
    "dryclean-W": "Lavaggio ad acqua professionale in lavanderia (W)",
    "dryclean-no": "Non lavare a secco",
  },
  profiles: {
    leather: { name: "Pelle e scamosciato", lines: [
      "Non va in lavatrice: l'acqua la indurisce e la macchia.",
      "Togli la polvere con un panno morbido; per lo scamosciato usa una spazzola apposita.",
      "Per macchie o una pulizia completa affidalo a una lavanderia specializzata in pelle.",
      "Se si bagna, lascialo asciugare all'aria, lontano da termosifoni e sole.",
    ] },
    hard: { name: "Metallo e gioielli", lines: [
      "Non si lava in lavatrice.",
      "Puliscilo con un panno morbido e asciutto; per l'argento usa un panno apposito.",
      "Tienilo lontano da profumi, creme e acqua salata.",
    ] },
    shoes: { name: "Scarpe", lines: [
      "Spazzola via la polvere e pulisci le macchie con un panno umido.",
      "Le sneakers in tela possono andare in lavatrice a 30° con un programma delicato, in un sacchetto, senza lacci e solette.",
      "Lasciale asciugare all'aria, riempite di carta, lontano da fonti di calore.",
    ] },
    bag: { name: "Borse", lines: [
      "Non vanno in lavatrice.",
      "Pulisci con un panno umido e poco sapone neutro, provando prima in un punto nascosto.",
      "Lasciala asciugare all'aria, riempita di carta perché mantenga la forma.",
    ] },
    swim: { name: "Costumi", lines: [
      "Sciacqualo subito in acqua fredda dopo il mare o la piscina, per togliere sale e cloro.",
      "Lavalo a mano con poco detersivo delicato.",
      "Asciugalo in piano all'ombra, senza asciugatrice.",
    ] },
    embellished: { name: "Paillettes e cristalli", lines: [
      "Meglio a mano in acqua fredda, al rovescio, senza strofinare.",
      "Se l'etichetta lo permette, programma delicati a 30° in un sacchetto a rete, con centrifuga bassa.",
      "Niente asciugatrice e niente ferro sulle decorazioni.",
      "Per i capi da sera più preziosi, la lavanderia è la scelta più sicura.",
    ] },
    velvet: { name: "Velluto", lines: [
      "Spesso va lavato a secco: controlla l'etichetta.",
      "Se è lavabile, a mano in acqua fredda o con un programma delicato a 30°, al rovescio.",
      "Niente ferro diretto: usa il vapore dal rovescio, senza schiacciare il pelo.",
    ] },
    silk: { name: "Seta", lines: [
      "A mano in acqua fredda o tiepida con un detersivo per delicati, oppure programma seta a 30° se l'etichetta lo consente.",
      "Non strizzarla: avvolgila in un asciugamano per togliere l'acqua.",
      "Asciugala all'ombra, senza asciugatrice.",
      "Stirala al rovescio a bassa temperatura, quando è ancora leggermente umida.",
    ] },
    down: { name: "Piumini", lines: [
      "Programma piumini o delicati a 30°, con poco detersivo specifico.",
      "Asciugatrice a bassa temperatura con due palline da tennis, così la piuma non si raggruma.",
      "Assicurati che sia asciutto del tutto prima di riporlo.",
    ] },
    wool: { name: "Lana e cashmere", lines: [
      "Programma lana a 30° oppure a mano, con un detersivo per lana e centrifuga bassa.",
      "Non strizzarlo e non usare l'asciugatrice: si infeltrisce e si restringe.",
      "Asciugalo in piano su un asciugamano, ridandogli la forma.",
      "Spesso basta arieggiarlo: la lana si lava meno di quanto si pensi.",
    ] },
    viscose: { name: "Viscosa e fibre simili", lines: [
      "Programma delicati a 30°, con centrifuga bassa.",
      "Da bagnata è fragile: non strizzarla e non tirarla.",
      "Niente asciugatrice; stirala al rovescio a temperatura media.",
    ] },
    synthetic: { name: "Sintetici e misti", lines: [
      "Programma sintetici o misti a 30–40°.",
      "Asciugatrice solo a bassa temperatura, oppure all'aria.",
      "Ferro a bassa temperatura.",
    ] },
    linen: { name: "Lino", lines: [
      "Programma cotone a 40°, con centrifuga media per limitare le pieghe.",
      "Meglio asciugarlo all'aria: in asciugatrice può restringersi.",
      "Stiralo ad alta temperatura quando è ancora un po' umido.",
    ] },
    denim: { name: "Jeans", lines: [
      "Lavali al rovescio a 30° con capi di colore simile, così il colore dura di più.",
      "Non serve lavarli spesso: tra un lavaggio e l'altro basta arieggiarli.",
      "Meglio asciugarli all'aria; ferro a temperatura media.",
    ] },
    cotton: { name: "Cotone", lines: [
      "Programma cotone a 30–40°; 60° per asciugamani e lenzuola bianche.",
      "Dividi i bianchi dai chiari e dagli scuri.",
      "Puoi usare l'asciugatrice, ma ad alta temperatura può restringersi; ferro ad alta temperatura.",
    ] },
  },
  extras: {
    bra: "Reggiseni: ganci chiusi e in un sacchetto a rete, oppure a mano; niente asciugatrice.",
    activewear: "Capi sportivi: niente ammorbidente, chiude i pori del tessuto tecnico.",
    hosiery: "Calze e collant: in un sacchetto a rete, con un programma delicato.",
  },
  programmesTitle: "Programmi della lavatrice",
  programmes: [
    { name: "Cotone 40–60°", use: "T-shirt, biancheria, asciugamani e capi in cotone resistenti; 60° per lenzuola e asciugamani." },
    { name: "Sintetici / Misti 30–40°", use: "Poliestere, nylon, capi in fibre miste." },
    { name: "Delicati 30°", use: "Viscosa, camicette, capi leggeri o con pizzi." },
    { name: "Lana / A mano 20–30°", use: "Lana, cashmere e seta quando l'etichetta lo permette; centrifuga bassa." },
    { name: "Jeans / Scuri 30°", use: "Denim e capi scuri, al rovescio per mantenere il colore." },
    { name: "Piumini", use: "Giacche e piumoni imbottiti in piuma, con un detersivo specifico." },
    { name: "Sport", use: "Tessuti tecnici, senza ammorbidente." },
    { name: "Rapido 15–30 min", use: "Capi poco sporchi e carichi piccoli." },
    { name: "Eco 40–60", use: "Cotone normalmente sporco: dura di più ma consuma meno." },
  ],
  tipsTitle: "Consigli per ogni lavaggio",
  tips: [
    "Dividi i capi per colore (bianchi, chiari, scuri) e per tessuto.",
    "Lava al rovescio jeans, capi scuri e capi stampati.",
    "Chiudi zip, bottoni e ganci e svuota le tasche.",
    "Usa un sacchetto a rete per reggiseni, calze e capi delicati.",
    "Non riempire troppo il cestello: i capi si lavano meglio e si stropicciano meno.",
    "Spesso basta meno detersivo di quanto si pensi.",
    "Nel dubbio, scegli la temperatura più bassa e la centrifuga più delicata.",
    "L'etichetta del capo vale sempre più di qualsiasi consiglio generale.",
  ],
};

const EN: LaundryText = {
  title: "Laundry guide",
  intro: "What the care-label symbols mean and which washing-machine programme to choose for each fabric.",
  careBoxEmpty: "Add the material to see how to wash it.",
  symbolsTitle: "Reference symbols to compare with the label",
  disclaimer: "General guidance based on the materials you entered: we can't see the piece, so we can't guarantee how the wash turns out. Always check the label before washing; it takes priority over these tips.",
  openGuide: "Care-label symbols and washing-machine programmes",
  groupTitles: { wash: "Washing", bleach: "Bleaching", dry: "Drying", iron: "Ironing", dryclean: "Professional cleaning" },
  symbolLabels: {
    "wash-30": "Machine wash up to 30°",
    "wash-40": "Machine wash up to 40°",
    "wash-60": "Machine wash up to 60°",
    "wash-30-gentle": "Gentle programme up to 30° (one line below)",
    "wash-40-gentle": "Gentle programme up to 40° (one line below)",
    "wash-30-very-gentle": "Very gentle programme up to 30°, like wool or silk (two lines below)",
    "wash-hand": "Hand wash only, in lukewarm water",
    "wash-no": "Do not wash in water",
    "bleach-any": "Any bleach allowed",
    "bleach-oxygen": "Only non-chlorine, oxygen bleach",
    "bleach-no": "Do not bleach",
    "tumble-normal": "Tumble dry at normal heat (two dots)",
    "tumble-low": "Tumble dry at low heat (one dot)",
    "tumble-no": "Do not tumble dry",
    "dry-line": "Line dry",
    "dry-flat": "Dry flat",
    "dry-drip": "Drip dry: hang without wringing",
    "dry-shade": "Dry in the shade",
    "iron-3": "Iron at high heat, up to 200° (three dots)",
    "iron-2": "Iron at medium heat, up to 150° (two dots)",
    "iron-1": "Iron at low heat, up to 110°, no steam (one dot)",
    "iron-no": "Do not iron",
    "dryclean-P": "Professional dry cleaning (P)",
    "dryclean-F": "Gentle professional dry cleaning (F)",
    "dryclean-W": "Professional wet cleaning (W)",
    "dryclean-no": "Do not dry clean",
  },
  profiles: {
    leather: { name: "Leather and suede", lines: [
      "Not for the washing machine: water stiffens and stains it.",
      "Dust it with a soft cloth; use a dedicated brush for suede.",
      "For stains or a full clean, take it to a cleaner who specialises in leather.",
      "If it gets wet, let it air dry away from radiators and sunlight.",
    ] },
    hard: { name: "Metal and jewellery", lines: [
      "It doesn't go in the washing machine.",
      "Clean it with a soft, dry cloth; use a dedicated cloth for silver.",
      "Keep it away from perfume, creams and salt water.",
    ] },
    shoes: { name: "Shoes", lines: [
      "Brush off the dust and wipe stains with a damp cloth.",
      "Canvas sneakers can go in the machine on a gentle 30° programme, in a bag, without laces and insoles.",
      "Let them air dry, stuffed with paper, away from heat.",
    ] },
    bag: { name: "Bags", lines: [
      "They don't go in the washing machine.",
      "Wipe with a damp cloth and a little mild soap, testing a hidden spot first.",
      "Let it air dry, stuffed with paper so it keeps its shape.",
    ] },
    swim: { name: "Swimwear", lines: [
      "Rinse it in cold water straight after the sea or the pool, to remove salt and chlorine.",
      "Hand wash it with a little mild detergent.",
      "Dry it flat in the shade, never in the dryer.",
    ] },
    embellished: { name: "Sequins and crystals", lines: [
      "Best by hand in cold water, inside out, without rubbing.",
      "If the label allows, a gentle 30° programme in a mesh bag with a low spin.",
      "No dryer and no iron on the decorations.",
      "For precious evening pieces, a professional cleaner is the safest choice.",
    ] },
    velvet: { name: "Velvet", lines: [
      "It is often dry clean only: check the label.",
      "If washable, by hand in cold water or on a gentle 30° programme, inside out.",
      "No direct iron: steam it from the inside without flattening the pile.",
    ] },
    silk: { name: "Silk", lines: [
      "By hand in cold or lukewarm water with a delicates detergent, or a 30° silk programme if the label allows.",
      "Don't wring it: roll it in a towel to remove the water.",
      "Dry it in the shade, never in the dryer.",
      "Iron it inside out at low heat while still slightly damp.",
    ] },
    down: { name: "Down", lines: [
      "Down or gentle programme at 30°, with a little dedicated detergent.",
      "Tumble dry at low heat with two tennis balls so the down doesn't clump.",
      "Make sure it is completely dry before putting it away.",
    ] },
    wool: { name: "Wool and cashmere", lines: [
      "Wool programme at 30° or by hand, with a wool detergent and a low spin.",
      "Don't wring it and don't tumble dry it: it felts and shrinks.",
      "Dry it flat on a towel, easing it back into shape.",
      "Airing is often enough: wool needs washing less than you'd think.",
    ] },
    viscose: { name: "Viscose and similar fibres", lines: [
      "Gentle programme at 30° with a low spin.",
      "It is fragile when wet: don't wring or stretch it.",
      "No dryer; iron inside out at medium heat.",
    ] },
    synthetic: { name: "Synthetics and blends", lines: [
      "Synthetics or mixed programme at 30–40°.",
      "Tumble dry only at low heat, or air dry.",
      "Iron at low heat.",
    ] },
    linen: { name: "Linen", lines: [
      "Cotton programme at 40° with a medium spin to limit creases.",
      "Air drying is best: it can shrink in the dryer.",
      "Iron at high heat while still a little damp.",
    ] },
    denim: { name: "Jeans", lines: [
      "Wash inside out at 30° with similar colours, so the colour lasts longer.",
      "No need to wash them often: airing them in between is enough.",
      "Air drying is best; iron at medium heat.",
    ] },
    cotton: { name: "Cotton", lines: [
      "Cotton programme at 30–40°; 60° for white towels and sheets.",
      "Separate whites, lights and darks.",
      "The dryer is fine, but high heat can shrink it; iron at high heat.",
    ] },
  },
  extras: {
    bra: "Bras: hooks fastened and in a mesh bag, or by hand; no dryer.",
    activewear: "Activewear: no fabric softener, it clogs technical fabrics.",
    hosiery: "Socks and tights: in a mesh bag on a gentle programme.",
  },
  programmesTitle: "Washing-machine programmes",
  programmes: [
    { name: "Cotton 40–60°", use: "T-shirts, underwear, towels and sturdy cotton pieces; 60° for sheets and towels." },
    { name: "Synthetics / Mixed 30–40°", use: "Polyester, nylon and blended fabrics." },
    { name: "Delicates 30°", use: "Viscose, blouses, light or lace pieces." },
    { name: "Wool / Hand wash 20–30°", use: "Wool, cashmere and silk when the label allows; low spin." },
    { name: "Jeans / Darks 30°", use: "Denim and dark pieces, inside out to keep the colour." },
    { name: "Down", use: "Down jackets and duvets, with a dedicated detergent." },
    { name: "Sport", use: "Technical fabrics, without fabric softener." },
    { name: "Quick 15–30 min", use: "Lightly soiled pieces and small loads." },
    { name: "Eco 40–60", use: "Normally soiled cotton: it takes longer but uses less energy." },
  ],
  tipsTitle: "Tips for every wash",
  tips: [
    "Sort by colour (whites, lights, darks) and by fabric.",
    "Wash jeans, dark and printed pieces inside out.",
    "Close zips, buttons and hooks, and empty the pockets.",
    "Use a mesh bag for bras, socks and delicate pieces.",
    "Don't overfill the drum: clothes get cleaner and crease less.",
    "Less detergent than you think is often enough.",
    "When in doubt, choose the lower temperature and the gentler spin.",
    "The piece's label always beats any general advice.",
  ],
};

const FR: LaundryText = {
  title: "Guide du lavage",
  intro: "Ce que veulent dire les symboles de l'étiquette et quel programme de lave-linge choisir pour chaque tissu.",
  careBoxEmpty: "Ajoutez la matière pour voir comment le laver.",
  symbolsTitle: "Symboles de référence à comparer avec l'étiquette",
  disclaimer: "Conseils généraux basés sur les matières que vous avez saisies : nous ne voyons pas le vêtement et ne pouvons donc pas garantir le résultat du lavage. Vérifiez toujours l'étiquette avant de laver ; elle prime sur ces conseils.",
  openGuide: "Symboles de l'étiquette et programmes du lave-linge",
  groupTitles: { wash: "Lavage", bleach: "Blanchiment", dry: "Séchage", iron: "Repassage", dryclean: "Nettoyage professionnel" },
  symbolLabels: {
    "wash-30": "Lavage en machine jusqu'à 30°",
    "wash-40": "Lavage en machine jusqu'à 40°",
    "wash-60": "Lavage en machine jusqu'à 60°",
    "wash-30-gentle": "Programme délicat jusqu'à 30° (un trait dessous)",
    "wash-40-gentle": "Programme délicat jusqu'à 40° (un trait dessous)",
    "wash-30-very-gentle": "Programme très délicat jusqu'à 30°, comme laine ou soie (deux traits dessous)",
    "wash-hand": "Lavage à la main uniquement, à l'eau tiède",
    "wash-no": "Ne pas laver à l'eau",
    "bleach-any": "Tout agent de blanchiment autorisé",
    "bleach-oxygen": "Uniquement un blanchiment sans chlore, à l'oxygène",
    "bleach-no": "Ne pas blanchir",
    "tumble-normal": "Sèche-linge à température normale (deux points)",
    "tumble-low": "Sèche-linge à basse température (un point)",
    "tumble-no": "Pas de sèche-linge",
    "dry-line": "Séchage sur fil",
    "dry-flat": "Séchage à plat",
    "dry-drip": "Séchage sur fil sans essorer, en le laissant s'égoutter",
    "dry-shade": "Séchage à l'ombre",
    "iron-3": "Repassage à haute température, jusqu'à 200° (trois points)",
    "iron-2": "Repassage à température moyenne, jusqu'à 150° (deux points)",
    "iron-1": "Repassage à basse température, jusqu'à 110°, sans vapeur (un point)",
    "iron-no": "Ne pas repasser",
    "dryclean-P": "Nettoyage à sec professionnel (P)",
    "dryclean-F": "Nettoyage à sec professionnel délicat (F)",
    "dryclean-W": "Nettoyage à l'eau professionnel (W)",
    "dryclean-no": "Pas de nettoyage à sec",
  },
  profiles: {
    leather: { name: "Cuir et daim", lines: [
      "Pas de lave-linge : l'eau le durcit et le tache.",
      "Dépoussiérez-le avec un chiffon doux ; pour le daim, utilisez une brosse adaptée.",
      "Pour les taches ou un nettoyage complet, confiez-le à un pressing spécialisé dans le cuir.",
      "S'il est mouillé, laissez-le sécher à l'air, loin des radiateurs et du soleil.",
    ] },
    hard: { name: "Métal et bijoux", lines: [
      "Il ne va pas au lave-linge.",
      "Nettoyez-le avec un chiffon doux et sec ; pour l'argent, utilisez un chiffon spécial.",
      "Tenez-le à l'écart des parfums, des crèmes et de l'eau salée.",
    ] },
    shoes: { name: "Chaussures", lines: [
      "Brossez la poussière et nettoyez les taches avec un chiffon humide.",
      "Les baskets en toile peuvent aller en machine à 30° en programme délicat, dans un sac, sans lacets ni semelles.",
      "Laissez-les sécher à l'air, remplies de papier, loin de la chaleur.",
    ] },
    bag: { name: "Sacs", lines: [
      "Ils ne vont pas au lave-linge.",
      "Nettoyez avec un chiffon humide et un peu de savon doux, en testant d'abord sur une zone cachée.",
      "Laissez-le sécher à l'air, rempli de papier pour qu'il garde sa forme.",
    ] },
    swim: { name: "Maillots de bain", lines: [
      "Rincez-le à l'eau froide juste après la mer ou la piscine, pour enlever le sel et le chlore.",
      "Lavez-le à la main avec un peu de lessive douce.",
      "Séchez-le à plat à l'ombre, jamais au sèche-linge.",
    ] },
    embellished: { name: "Paillettes et cristaux", lines: [
      "De préférence à la main à l'eau froide, sur l'envers, sans frotter.",
      "Si l'étiquette le permet, programme délicat à 30° dans un filet, essorage faible.",
      "Pas de sèche-linge ni de fer sur les décorations.",
      "Pour les tenues de soirée précieuses, le pressing reste le choix le plus sûr.",
    ] },
    velvet: { name: "Velours", lines: [
      "Il se nettoie souvent à sec : vérifiez l'étiquette.",
      "S'il est lavable, à la main à l'eau froide ou en programme délicat à 30°, sur l'envers.",
      "Pas de fer direct : utilisez la vapeur sur l'envers, sans écraser le poil.",
    ] },
    silk: { name: "Soie", lines: [
      "À la main à l'eau froide ou tiède avec une lessive pour textiles délicats, ou programme soie à 30° si l'étiquette le permet.",
      "Ne l'essorez pas : roulez-la dans une serviette pour enlever l'eau.",
      "Séchez-la à l'ombre, jamais au sèche-linge.",
      "Repassez-la sur l'envers à basse température, encore légèrement humide.",
    ] },
    down: { name: "Doudounes", lines: [
      "Programme doudoune ou délicat à 30°, avec un peu de lessive spécifique.",
      "Sèche-linge à basse température avec deux balles de tennis, pour que le duvet ne s'agglutine pas.",
      "Vérifiez qu'elle est parfaitement sèche avant de la ranger.",
    ] },
    wool: { name: "Laine et cachemire", lines: [
      "Programme laine à 30° ou à la main, avec une lessive pour laine et un essorage faible.",
      "Ne l'essorez pas et pas de sèche-linge : elle feutre et rétrécit.",
      "Séchez-la à plat sur une serviette en lui redonnant sa forme.",
      "L'aérer suffit souvent : la laine se lave moins qu'on ne le pense.",
    ] },
    viscose: { name: "Viscose et fibres proches", lines: [
      "Programme délicat à 30° avec un essorage faible.",
      "Mouillée, elle est fragile : ne la tordez pas et ne la tirez pas.",
      "Pas de sèche-linge ; repassez sur l'envers à température moyenne.",
    ] },
    synthetic: { name: "Synthétiques et mélanges", lines: [
      "Programme synthétiques ou mixte à 30–40°.",
      "Sèche-linge seulement à basse température, ou séchage à l'air.",
      "Repassage à basse température.",
    ] },
    linen: { name: "Lin", lines: [
      "Programme coton à 40° avec un essorage moyen pour limiter les plis.",
      "Mieux vaut le sécher à l'air : il peut rétrécir au sèche-linge.",
      "Repassez-le à haute température encore un peu humide.",
    ] },
    denim: { name: "Jeans", lines: [
      "Lavez-les sur l'envers à 30° avec des couleurs proches, la couleur dure plus longtemps.",
      "Inutile de les laver souvent : les aérer entre deux lavages suffit.",
      "Mieux vaut les sécher à l'air ; repassage à température moyenne.",
    ] },
    cotton: { name: "Coton", lines: [
      "Programme coton à 30–40° ; 60° pour les serviettes et draps blancs.",
      "Séparez le blanc, les couleurs claires et les foncées.",
      "Le sèche-linge est possible, mais une température élevée peut le faire rétrécir ; repassage à haute température.",
    ] },
  },
  extras: {
    bra: "Soutiens-gorge : agrafes fermées et dans un filet, ou à la main ; pas de sèche-linge.",
    activewear: "Vêtements de sport : pas d'assouplissant, il bouche les tissus techniques.",
    hosiery: "Chaussettes et collants : dans un filet, en programme délicat.",
  },
  programmesTitle: "Programmes du lave-linge",
  programmes: [
    { name: "Coton 40–60°", use: "T-shirts, linge de corps, serviettes et pièces en coton résistantes ; 60° pour draps et serviettes." },
    { name: "Synthétiques / Mixte 30–40°", use: "Polyester, nylon, tissus mélangés." },
    { name: "Délicat 30°", use: "Viscose, chemisiers, pièces légères ou en dentelle." },
    { name: "Laine / Lavage main 20–30°", use: "Laine, cachemire et soie quand l'étiquette le permet ; essorage faible." },
    { name: "Jeans / Foncés 30°", use: "Denim et pièces foncées, sur l'envers pour garder la couleur." },
    { name: "Doudoune", use: "Doudounes et couettes en duvet, avec une lessive spécifique." },
    { name: "Sport", use: "Tissus techniques, sans assouplissant." },
    { name: "Rapide 15–30 min", use: "Pièces peu sales et petites charges." },
    { name: "Éco 40–60", use: "Coton normalement sale : plus long mais plus économe." },
  ],
  tipsTitle: "Conseils pour chaque lavage",
  tips: [
    "Triez par couleur (blanc, clair, foncé) et par tissu.",
    "Lavez sur l'envers les jeans, les pièces foncées et imprimées.",
    "Fermez zips, boutons et agrafes, et videz les poches.",
    "Utilisez un filet pour les soutiens-gorge, les chaussettes et les pièces délicates.",
    "Ne surchargez pas le tambour : le linge est mieux lavé et moins froissé.",
    "Souvent, moins de lessive qu'on ne le pense suffit.",
    "En cas de doute, choisissez la température la plus basse et l'essorage le plus doux.",
    "L'étiquette du vêtement l'emporte toujours sur un conseil général.",
  ],
};

const ES: LaundryText = {
  title: "Guía de lavado",
  intro: "Qué significan los símbolos de la etiqueta y qué programa de la lavadora elegir para cada tejido.",
  careBoxEmpty: "Añade el material para ver cómo lavarlo.",
  symbolsTitle: "Símbolos de referencia para comparar con la etiqueta",
  disclaimer: "Indicaciones generales basadas en los materiales que has introducido: no vemos la prenda, así que no podemos garantizar el resultado del lavado. Revisa siempre la etiqueta antes de lavarla; vale más que estos consejos.",
  openGuide: "Símbolos de la etiqueta y programas de la lavadora",
  groupTitles: { wash: "Lavado", bleach: "Lejía", dry: "Secado", iron: "Planchado", dryclean: "Limpieza profesional" },
  symbolLabels: {
    "wash-30": "Lavadora hasta 30°",
    "wash-40": "Lavadora hasta 40°",
    "wash-60": "Lavadora hasta 60°",
    "wash-30-gentle": "Programa delicado hasta 30° (una línea debajo)",
    "wash-40-gentle": "Programa delicado hasta 40° (una línea debajo)",
    "wash-30-very-gentle": "Programa muy delicado hasta 30°, como lana o seda (dos líneas debajo)",
    "wash-hand": "Solo lavado a mano, en agua tibia",
    "wash-no": "No lavar con agua",
    "bleach-any": "Se puede usar lejía",
    "bleach-oxygen": "Solo blanqueadores sin cloro, de oxígeno",
    "bleach-no": "No usar lejía",
    "tumble-normal": "Secadora a temperatura normal (dos puntos)",
    "tumble-low": "Secadora a baja temperatura (un punto)",
    "tumble-no": "No usar secadora",
    "dry-line": "Secar colgado",
    "dry-flat": "Secar en plano",
    "dry-drip": "Secar colgado sin escurrir, dejando que gotee",
    "dry-shade": "Secar a la sombra",
    "iron-3": "Planchar a alta temperatura, hasta 200° (tres puntos)",
    "iron-2": "Planchar a temperatura media, hasta 150° (dos puntos)",
    "iron-1": "Planchar a baja temperatura, hasta 110°, sin vapor (un punto)",
    "iron-no": "No planchar",
    "dryclean-P": "Limpieza en seco profesional (P)",
    "dryclean-F": "Limpieza en seco profesional delicada (F)",
    "dryclean-W": "Limpieza al agua profesional (W)",
    "dryclean-no": "No limpiar en seco",
  },
  profiles: {
    leather: { name: "Piel y ante", lines: [
      "No va a la lavadora: el agua la endurece y la mancha.",
      "Quítale el polvo con un paño suave; para el ante usa un cepillo específico.",
      "Para manchas o una limpieza completa, llévala a una tintorería especializada en piel.",
      "Si se moja, déjala secar al aire, lejos de radiadores y del sol.",
    ] },
    hard: { name: "Metal y joyas", lines: [
      "No se lava en la lavadora.",
      "Límpialo con un paño suave y seco; para la plata usa un paño específico.",
      "Mantenlo lejos de perfumes, cremas y agua salada.",
    ] },
    shoes: { name: "Zapatos", lines: [
      "Cepilla el polvo y limpia las manchas con un paño húmedo.",
      "Las zapatillas de lona pueden ir a la lavadora a 30° en programa delicado, en una bolsa, sin cordones ni plantillas.",
      "Déjalas secar al aire, rellenas de papel, lejos del calor.",
    ] },
    bag: { name: "Bolsos", lines: [
      "No van a la lavadora.",
      "Límpialo con un paño húmedo y un poco de jabón neutro, probando antes en una zona escondida.",
      "Déjalo secar al aire, relleno de papel para que mantenga la forma.",
    ] },
    swim: { name: "Bañadores", lines: [
      "Acláralo en agua fría justo después del mar o la piscina, para quitar la sal y el cloro.",
      "Lávalo a mano con un poco de detergente suave.",
      "Sécalo en plano a la sombra, nunca en secadora.",
    ] },
    embellished: { name: "Lentejuelas y cristales", lines: [
      "Mejor a mano en agua fría, del revés, sin frotar.",
      "Si la etiqueta lo permite, programa delicado a 30° en una bolsa de red, con centrifugado bajo.",
      "Sin secadora y sin plancha sobre los adornos.",
      "Para las prendas de noche más valiosas, la tintorería es la opción más segura.",
    ] },
    velvet: { name: "Terciopelo", lines: [
      "A menudo es de limpieza en seco: revisa la etiqueta.",
      "Si se puede lavar, a mano en agua fría o en programa delicado a 30°, del revés.",
      "Sin plancha directa: usa el vapor por el revés, sin aplastar el pelo.",
    ] },
    silk: { name: "Seda", lines: [
      "A mano en agua fría o tibia con detergente para delicados, o programa seda a 30° si la etiqueta lo permite.",
      "No la escurras: envuélvela en una toalla para quitar el agua.",
      "Sécala a la sombra, nunca en secadora.",
      "Plánchala del revés a baja temperatura, todavía algo húmeda.",
    ] },
    down: { name: "Plumíferos", lines: [
      "Programa plumas o delicado a 30°, con poco detergente específico.",
      "Secadora a baja temperatura con dos pelotas de tenis, para que la pluma no se apelmace.",
      "Asegúrate de que esté totalmente seco antes de guardarlo.",
    ] },
    wool: { name: "Lana y cachemir", lines: [
      "Programa lana a 30° o a mano, con detergente para lana y centrifugado bajo.",
      "No lo escurras ni uses secadora: se apelmaza y encoge.",
      "Sécalo en plano sobre una toalla, devolviéndole la forma.",
      "A menudo basta con airearlo: la lana se lava menos de lo que parece.",
    ] },
    viscose: { name: "Viscosa y fibras parecidas", lines: [
      "Programa delicado a 30° con centrifugado bajo.",
      "Mojada es frágil: no la escurras ni la estires.",
      "Sin secadora; plancha del revés a temperatura media.",
    ] },
    synthetic: { name: "Sintéticos y mezclas", lines: [
      "Programa sintéticos o mixto a 30–40°.",
      "Secadora solo a baja temperatura, o al aire.",
      "Plancha a baja temperatura.",
    ] },
    linen: { name: "Lino", lines: [
      "Programa algodón a 40° con centrifugado medio para limitar las arrugas.",
      "Mejor secarlo al aire: en la secadora puede encoger.",
      "Plánchalo a alta temperatura cuando aún esté algo húmedo.",
    ] },
    denim: { name: "Vaqueros", lines: [
      "Lávalos del revés a 30° con colores parecidos, así el color dura más.",
      "No hace falta lavarlos a menudo: basta con airearlos entre lavados.",
      "Mejor secarlos al aire; plancha a temperatura media.",
    ] },
    cotton: { name: "Algodón", lines: [
      "Programa algodón a 30–40°; 60° para toallas y sábanas blancas.",
      "Separa lo blanco, lo claro y lo oscuro.",
      "Puedes usar la secadora, pero a alta temperatura puede encoger; plancha a alta temperatura.",
    ] },
  },
  extras: {
    bra: "Sujetadores: con los corchetes cerrados y en una bolsa de red, o a mano; sin secadora.",
    activewear: "Ropa deportiva: sin suavizante, tapa los tejidos técnicos.",
    hosiery: "Calcetines y medias: en una bolsa de red, con programa delicado.",
  },
  programmesTitle: "Programas de la lavadora",
  programmes: [
    { name: "Algodón 40–60°", use: "Camisetas, ropa interior, toallas y prendas de algodón resistentes; 60° para sábanas y toallas." },
    { name: "Sintéticos / Mixto 30–40°", use: "Poliéster, nailon y tejidos mixtos." },
    { name: "Delicado 30°", use: "Viscosa, blusas, prendas ligeras o con encaje." },
    { name: "Lana / A mano 20–30°", use: "Lana, cachemir y seda cuando la etiqueta lo permite; centrifugado bajo." },
    { name: "Vaqueros / Oscuros 30°", use: "Denim y prendas oscuras, del revés para conservar el color." },
    { name: "Plumas", use: "Plumíferos y edredones de pluma, con detergente específico." },
    { name: "Deporte", use: "Tejidos técnicos, sin suavizante." },
    { name: "Rápido 15–30 min", use: "Prendas poco sucias y cargas pequeñas." },
    { name: "Eco 40–60", use: "Algodón con suciedad normal: tarda más pero gasta menos." },
  ],
  tipsTitle: "Consejos para cada lavado",
  tips: [
    "Separa por color (blancos, claros, oscuros) y por tejido.",
    "Lava del revés los vaqueros, las prendas oscuras y las estampadas.",
    "Cierra cremalleras, botones y corchetes, y vacía los bolsillos.",
    "Usa una bolsa de red para sujetadores, calcetines y prendas delicadas.",
    "No llenes demasiado el tambor: la ropa se lava mejor y se arruga menos.",
    "A menudo basta con menos detergente de lo que parece.",
    "En caso de duda, elige la temperatura más baja y el centrifugado más suave.",
    "La etiqueta de la prenda siempre vale más que cualquier consejo general.",
  ],
};

const ZH: LaundryText = {
  title: "洗涤指南",
  intro: "洗标符号代表什么，以及每种面料该选洗衣机的哪个程序。",
  careBoxEmpty: "添加材质后即可查看洗涤方法。",
  symbolsTitle: "可与洗标对照的参考符号",
  disclaimer: "以上为根据你填写的材质给出的一般建议：我们看不到衣物本身，因此无法保证洗涤效果。洗涤前请务必查看洗标，洗标优先于这些建议。",
  openGuide: "洗标符号与洗衣机程序",
  groupTitles: { wash: "水洗", bleach: "漂白", dry: "干燥", iron: "熨烫", dryclean: "专业清洗" },
  symbolLabels: {
    "wash-30": "机洗，水温不超过30°",
    "wash-40": "机洗，水温不超过40°",
    "wash-60": "机洗，水温不超过60°",
    "wash-30-gentle": "轻柔程序，水温不超过30°（下方一条线）",
    "wash-40-gentle": "轻柔程序，水温不超过40°（下方一条线）",
    "wash-30-very-gentle": "非常轻柔的程序，水温不超过30°，如羊毛或真丝程序（下方两条线）",
    "wash-hand": "仅限温水手洗",
    "wash-no": "不可水洗",
    "bleach-any": "可使用漂白剂",
    "bleach-oxygen": "仅可使用不含氯的氧漂剂",
    "bleach-no": "不可漂白",
    "tumble-normal": "可常温烘干（两个点）",
    "tumble-low": "可低温烘干（一个点）",
    "tumble-no": "不可烘干",
    "dry-line": "悬挂晾干",
    "dry-flat": "平铺晾干",
    "dry-drip": "不拧干，直接悬挂滴干",
    "dry-shade": "阴凉处晾干",
    "iron-3": "高温熨烫，不超过200°（三个点）",
    "iron-2": "中温熨烫，不超过150°（两个点）",
    "iron-1": "低温熨烫，不超过110°，不用蒸汽（一个点）",
    "iron-no": "不可熨烫",
    "dryclean-P": "专业干洗（P）",
    "dryclean-F": "温和专业干洗（F）",
    "dryclean-W": "专业湿洗（W）",
    "dryclean-no": "不可干洗",
  },
  profiles: {
    leather: { name: "皮革与麂皮", lines: [
      "不可机洗：水会让皮革变硬并留下污渍。",
      "用软布除尘；麂皮请用专用刷。",
      "有污渍或需要彻底清洁时，请交给专业皮革洗护店。",
      "如果淋湿，请自然风干，远离暖气和阳光。",
    ] },
    hard: { name: "金属与饰品", lines: [
      "不可机洗。",
      "用干燥的软布擦拭；银饰请用专用擦银布。",
      "避免接触香水、乳液和海水。",
    ] },
    shoes: { name: "鞋履", lines: [
      "刷去灰尘，用湿布擦去污渍。",
      "帆布运动鞋可装入洗衣袋，取下鞋带和鞋垫，用30°轻柔程序机洗。",
      "塞入纸团自然风干，远离热源。",
    ] },
    bag: { name: "包袋", lines: [
      "不可机洗。",
      "用湿布蘸少量中性皂擦拭，先在不显眼处试一下。",
      "塞入纸团自然风干，保持包型。",
    ] },
    swim: { name: "泳衣", lines: [
      "游泳或下海后立即用冷水冲洗，去除盐分和氯。",
      "用少量温和洗涤剂手洗。",
      "在阴凉处平铺晾干，不可烘干。",
    ] },
    embellished: { name: "亮片与水晶", lines: [
      "最好翻面后用冷水手洗，不要揉搓。",
      "如洗标允许，可装入洗衣网袋，用30°轻柔程序、低速脱水。",
      "不可烘干，装饰部位不可熨烫。",
      "贵重的晚装，交给专业洗衣店最稳妥。",
    ] },
    velvet: { name: "丝绒", lines: [
      "丝绒常常只能干洗：请查看洗标。",
      "如可水洗，请翻面后冷水手洗或用30°轻柔程序。",
      "不要直接熨烫：从反面用蒸汽，避免压坏绒毛。",
    ] },
    silk: { name: "真丝", lines: [
      "用冷水或温水加精细衣物洗涤剂手洗；如洗标允许，也可用30°真丝程序。",
      "不要拧干：用毛巾卷起吸去水分。",
      "阴凉处晾干，不可烘干。",
      "趁微湿时翻面低温熨烫。",
    ] },
    down: { name: "羽绒", lines: [
      "用羽绒程序或30°轻柔程序，加少量专用洗涤剂。",
      "低温烘干，并放入两个网球，防止羽绒结块。",
      "收纳前确保完全干透。",
    ] },
    wool: { name: "羊毛与羊绒", lines: [
      "用30°羊毛程序或手洗，加羊毛专用洗涤剂，低速脱水。",
      "不要拧干，也不要烘干：会毡化缩水。",
      "平铺在毛巾上晾干，并整理回原形。",
      "很多时候通风即可：羊毛不需要经常洗。",
    ] },
    viscose: { name: "粘胶及类似纤维", lines: [
      "30°轻柔程序，低速脱水。",
      "湿的时候很脆弱：不要拧，也不要拉扯。",
      "不可烘干；翻面中温熨烫。",
    ] },
    synthetic: { name: "合成纤维与混纺", lines: [
      "用合成纤维或混合程序，30–40°。",
      "只能低温烘干，或自然晾干。",
      "低温熨烫。",
    ] },
    linen: { name: "亚麻", lines: [
      "40°棉织物程序，中速脱水以减少褶皱。",
      "最好自然晾干：烘干可能会缩水。",
      "趁还有些潮湿时高温熨烫。",
    ] },
    denim: { name: "牛仔", lines: [
      "翻面后与相近颜色一起30°洗涤，颜色更持久。",
      "不必经常洗：两次洗涤之间通风即可。",
      "最好自然晾干；中温熨烫。",
    ] },
    cotton: { name: "棉", lines: [
      "棉织物程序30–40°；白色毛巾和床单可用60°。",
      "白色、浅色和深色分开洗。",
      "可以烘干，但高温可能缩水；高温熨烫。",
    ] },
  },
  extras: {
    bra: "文胸：扣好搭扣放入洗衣网袋，或手洗；不可烘干。",
    activewear: "运动服：不要用柔顺剂，会堵塞功能面料。",
    hosiery: "袜子和连裤袜：放入洗衣网袋，用轻柔程序。",
  },
  programmesTitle: "洗衣机程序",
  programmes: [
    { name: "棉织物 40–60°", use: "T恤、内衣、毛巾和耐洗的棉质衣物；床单和毛巾可用60°。" },
    { name: "合成纤维 / 混合 30–40°", use: "涤纶、尼龙和混纺面料。" },
    { name: "轻柔 30°", use: "粘胶、衬衫、轻薄或带蕾丝的衣物。" },
    { name: "羊毛 / 手洗 20–30°", use: "羊毛、羊绒，以及洗标允许时的真丝；低速脱水。" },
    { name: "牛仔 / 深色 30°", use: "牛仔和深色衣物，翻面洗以保持颜色。" },
    { name: "羽绒", use: "羽绒服和羽绒被，配合专用洗涤剂。" },
    { name: "运动", use: "功能面料，不加柔顺剂。" },
    { name: "快洗 15–30 分钟", use: "不太脏的衣物和少量衣物。" },
    { name: "节能 40–60", use: "一般脏污的棉织物：时间更长但更省电。" },
  ],
  tipsTitle: "每次洗涤的小建议",
  tips: [
    "按颜色（白色、浅色、深色）和面料分开洗。",
    "牛仔、深色和印花衣物翻面洗。",
    "拉好拉链、扣好纽扣和搭扣，清空口袋。",
    "文胸、袜子和精细衣物放入洗衣网袋。",
    "不要把滚筒塞太满：衣物洗得更干净，也更少起皱。",
    "洗涤剂通常比想象中用得少就够了。",
    "拿不准时，选择更低的水温和更轻柔的脱水。",
    "衣物洗标永远比一般建议更重要。",
  ],
};

const TEXTS: Record<string, LaundryText> = { it: IT, en: EN, fr: FR, es: ES, zh: ZH };

export function laundryTextFor(language: string | undefined): LaundryText {
  const base = (language ?? "en").slice(0, 2).toLowerCase();
  return TEXTS[base] ?? EN;
}

export const LAUNDRY_LANGUAGES = Object.keys(TEXTS);
