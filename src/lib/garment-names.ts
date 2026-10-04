// Colour, category and garment-type names in the person's language. Wardrobe rows store them in
// English (the palette and the option lists are English values), so anything shown to the person —
// "Aquazzura · Jet Black · Sandals" — or handed to the AI as a fact goes through here first and
// reads "Aquazzura · Nero · Sandali" in Italian. Unknown values (a brand, a model, a free-typed
// colour) are left as they are.

type Lang = "it" | "es" | "fr";
type Names = Record<string, [it: string, es: string, fr: string]>;

const COLORS: Names = {
  "Pure White": ["Bianco", "Blanco", "Blanc"],
  "Off White": ["Bianco sporco", "Blanco roto", "Blanc cassé"],
  Ivory: ["Avorio", "Marfil", "Ivoire"],
  Cream: ["Crema", "Crema", "Crème"],
  Ecru: ["Écru", "Crudo", "Écru"],
  Pearl: ["Perla", "Perla", "Perle"],
  "Jet Black": ["Nero", "Negro", "Noir"],
  "Soft Black": ["Nero tenue", "Negro suave", "Noir doux"],
  Charcoal: ["Antracite", "Antracita", "Anthracite"],
  Graphite: ["Grafite", "Grafito", "Graphite"],
  "Slate Grey": ["Grigio ardesia", "Gris pizarra", "Gris ardoise"],
  "Cool Grey": ["Grigio freddo", "Gris frío", "Gris froid"],
  "Warm Grey": ["Grigio caldo", "Gris cálido", "Gris chaud"],
  "Silver Grey": ["Grigio argento", "Gris plata", "Gris argenté"],
  "Dove Grey": ["Grigio tortora", "Gris paloma", "Gris tourterelle"],
  Beige: ["Beige", "Beige", "Beige"],
  Sand: ["Sabbia", "Arena", "Sable"],
  Champagne: ["Champagne", "Champán", "Champagne"],
  Taupe: ["Tortora", "Topo", "Taupe"],
  Stone: ["Pietra", "Piedra", "Pierre"],
  Nude: ["Nude", "Nude", "Nude"],
  Buttermilk: ["Latte", "Mantequilla", "Babeurre"],
  Oat: ["Avena", "Avena", "Avoine"],
  Camel: ["Cammello", "Camel", "Camel"],
  Tan: ["Cuoio", "Tostado", "Fauve"],
  Caramel: ["Caramello", "Caramelo", "Caramel"],
  Cognac: ["Cognac", "Coñac", "Cognac"],
  Chocolate: ["Cioccolato", "Chocolate", "Chocolat"],
  Espresso: ["Caffè", "Café espresso", "Expresso"],
  Mocha: ["Moka", "Moca", "Moka"],
  Chestnut: ["Castagna", "Castaño", "Châtaigne"],
  Rust: ["Ruggine", "Óxido", "Rouille"],
  Sienna: ["Terra di Siena", "Siena", "Terre de Sienne"],
  Khaki: ["Kaki", "Caqui", "Kaki"],
  "Cherry Red": ["Rosso ciliegia", "Rojo cereza", "Rouge cerise"],
  Crimson: ["Cremisi", "Carmesí", "Cramoisi"],
  Ruby: ["Rubino", "Rubí", "Rubis"],
  Burgundy: ["Bordeaux", "Burdeos", "Bordeaux"],
  Wine: ["Vinaccia", "Vino", "Lie-de-vin"],
  Brick: ["Mattone", "Ladrillo", "Brique"],
  "Coral Red": ["Rosso corallo", "Rojo coral", "Rouge corail"],
  Blush: ["Rosa cipria", "Rosa empolvado", "Rose poudré"],
  "Powder Pink": ["Rosa polvere", "Rosa polvo", "Rose poudre"],
  Rose: ["Rosa", "Rosa", "Rose"],
  "Dusty Pink": ["Rosa antico", "Rosa palo", "Vieux rose"],
  "Hot Pink": ["Rosa acceso", "Rosa intenso", "Rose vif"],
  Fuchsia: ["Fucsia", "Fucsia", "Fuchsia"],
  Magenta: ["Magenta", "Magenta", "Magenta"],
  Salmon: ["Salmone", "Salmón", "Saumon"],
  Peach: ["Pesca", "Melocotón", "Pêche"],
  Apricot: ["Albicocca", "Albaricoque", "Abricot"],
  Coral: ["Corallo", "Coral", "Corail"],
  Tangerine: ["Mandarino", "Mandarina", "Mandarine"],
  Orange: ["Arancione", "Naranja", "Orange"],
  Terracotta: ["Terracotta", "Terracota", "Terre cuite"],
  "Burnt Orange": ["Arancio bruciato", "Naranja tostado", "Orange brûlé"],
  Butter: ["Giallo burro", "Amarillo mantequilla", "Jaune beurre"],
  Lemon: ["Limone", "Limón", "Citron"],
  Canary: ["Giallo canarino", "Amarillo canario", "Jaune canari"],
  Mustard: ["Senape", "Mostaza", "Moutarde"],
  Ochre: ["Ocra", "Ocre", "Ocre"],
  "Gold Yellow": ["Giallo oro", "Amarillo oro", "Jaune doré"],
  Mint: ["Menta", "Menta", "Menthe"],
  Sage: ["Salvia", "Salvia", "Sauge"],
  Pistachio: ["Pistacchio", "Pistacho", "Pistache"],
  Olive: ["Oliva", "Oliva", "Olive"],
  "Army Green": ["Verde militare", "Verde militar", "Vert militaire"],
  "Forest Green": ["Verde bosco", "Verde bosque", "Vert forêt"],
  Emerald: ["Smeraldo", "Esmeralda", "Émeraude"],
  "Kelly Green": ["Verde prato", "Verde Kelly", "Vert prairie"],
  "Hunter Green": ["Verde scuro", "Verde cazador", "Vert chasseur"],
  Teal: ["Verde petrolio", "Verde azulado", "Bleu canard"],
  Turquoise: ["Turchese", "Turquesa", "Turquoise"],
  Seafoam: ["Verde acqua", "Verde espuma", "Vert d'eau"],
  "Powder Blue": ["Azzurro polvere", "Azul empolvado", "Bleu poudré"],
  "Sky Blue": ["Azzurro cielo", "Azul cielo", "Bleu ciel"],
  "Baby Blue": ["Celeste", "Azul bebé", "Bleu layette"],
  Denim: ["Denim", "Denim", "Denim"],
  Cobalt: ["Blu cobalto", "Azul cobalto", "Bleu cobalt"],
  "Royal Blue": ["Blu royal", "Azul real", "Bleu roi"],
  Navy: ["Blu navy", "Azul marino", "Bleu marine"],
  "Midnight Blue": ["Blu notte", "Azul medianoche", "Bleu nuit"],
  "Slate Blue": ["Blu ardesia", "Azul pizarra", "Bleu ardoise"],
  "Steel Blue": ["Blu acciaio", "Azul acero", "Bleu acier"],
  "Ice Blue": ["Azzurro ghiaccio", "Azul hielo", "Bleu glacier"],
  Lavender: ["Lavanda", "Lavanda", "Lavande"],
  Lilac: ["Lilla", "Lila", "Lilas"],
  Mauve: ["Malva", "Malva", "Mauve"],
  Violet: ["Viola", "Violeta", "Violet"],
  Plum: ["Prugna", "Ciruela", "Prune"],
  Aubergine: ["Melanzana", "Berenjena", "Aubergine"],
  Amethyst: ["Ametista", "Amatista", "Améthyste"],
  Gold: ["Oro", "Oro", "Or"],
  "Rose Gold": ["Oro rosa", "Oro rosa", "Or rose"],
  Silver: ["Argento", "Plata", "Argent"],
  Bronze: ["Bronzo", "Bronce", "Bronze"],
  Copper: ["Rame", "Cobre", "Cuivre"],
  Pewter: ["Peltro", "Peltre", "Étain"],
  Gunmetal: ["Canna di fucile", "Gris metal", "Gris acier"],
  "Animal Print": ["Animalier", "Animal print", "Imprimé animal"],
  Floral: ["Floreale", "Floral", "Fleuri"],
  Striped: ["Righe", "Rayas", "Rayé"],
  Checkered: ["Quadri", "Cuadros", "Carreaux"],
  "Denim Wash": ["Lavaggio denim", "Lavado denim", "Délavé denim"],
  "Tie Dye": ["Tie-dye", "Tie-dye", "Tie-dye"],
  // Plain words older rows use.
  Black: ["Nero", "Negro", "Noir"], White: ["Bianco", "Blanco", "Blanc"], Grey: ["Grigio", "Gris", "Gris"],
  Gray: ["Grigio", "Gris", "Gris"], Blue: ["Blu", "Azul", "Bleu"], Red: ["Rosso", "Rojo", "Rouge"],
  Green: ["Verde", "Verde", "Vert"], Brown: ["Marrone", "Marrón", "Marron"], Pink: ["Rosa", "Rosa", "Rose"],
  Yellow: ["Giallo", "Amarillo", "Jaune"], Purple: ["Viola", "Morado", "Violet"],
};

const SUBCATEGORIES: Names = {
  "T-Shirt": ["T-shirt", "Camiseta", "T-shirt"], Shirt: ["Camicia", "Camisa", "Chemise"], Blouse: ["Blusa", "Blusa", "Chemisier"],
  "Tank Top": ["Canotta", "Camiseta de tirantes", "Débardeur"], Camisole: ["Top a spalline", "Camisola", "Caraco"],
  "Crop Top": ["Crop top", "Top corto", "Crop top"], Bodysuit: ["Body", "Body", "Body"], Polo: ["Polo", "Polo", "Polo"],
  Sweater: ["Maglione", "Jersey", "Pull"], Cardigan: ["Cardigan", "Cárdigan", "Cardigan"], Hoodie: ["Felpa con cappuccio", "Sudadera con capucha", "Sweat à capuche"],
  Sweatshirt: ["Felpa", "Sudadera", "Sweat-shirt"], "Vest Top": ["Canotta", "Camiseta sin mangas", "Débardeur"], "Knit Top": ["Top in maglia", "Top de punto", "Haut en maille"],
  Tunic: ["Tunica", "Túnica", "Tunique"],
  Jeans: ["Jeans", "Vaqueros", "Jean"], Trousers: ["Pantaloni", "Pantalones", "Pantalon"], "Cargo Pants": ["Pantaloni cargo", "Pantalones cargo", "Pantalon cargo"],
  Joggers: ["Pantaloni jogger", "Joggers", "Jogging"], Leggings: ["Leggings", "Leggings", "Legging"], Shorts: ["Shorts", "Pantalones cortos", "Short"],
  "Bermuda Shorts": ["Bermuda", "Bermudas", "Bermuda"], Skirt: ["Gonna", "Falda", "Jupe"],
  "Slip Dress": ["Abito sottoveste", "Vestido lencero", "Robe nuisette"], "Shirt Dress": ["Abito chemisier", "Vestido camisero", "Robe chemise"],
  "Wrap Dress": ["Abito a portafoglio", "Vestido cruzado", "Robe portefeuille"], "Bodycon Dress": ["Abito aderente", "Vestido ceñido", "Robe moulante"],
  "A-line Dress": ["Abito svasato", "Vestido evasé", "Robe trapèze"], "Shift Dress": ["Abito dritto", "Vestido recto", "Robe droite"],
  "Sweater Dress": ["Abito in maglia", "Vestido de punto", "Robe pull"], "Evening Dress": ["Abito da sera", "Vestido de noche", "Robe de soirée"],
  Jumpsuit: ["Tuta", "Mono", "Combinaison"], Playsuit: ["Tutina corta", "Mono corto", "Combishort"], Romper: ["Pagliaccetto", "Pelele", "Barboteuse"],
  Blazer: ["Blazer", "Blazer", "Blazer"], Coat: ["Cappotto", "Abrigo", "Manteau"], "Trench Coat": ["Trench", "Gabardina", "Trench"],
  "Puffer Jacket": ["Piumino", "Plumífero", "Doudoune"], Parka: ["Parka", "Parka", "Parka"], "Rain Jacket": ["Impermeabile", "Chubasquero", "Imperméable"],
  Windbreaker: ["Giacca a vento", "Cortavientos", "Coupe-vent"], "Denim Jacket": ["Giacca di jeans", "Chaqueta vaquera", "Veste en jean"],
  "Leather Jacket": ["Giacca di pelle", "Chaqueta de cuero", "Veste en cuir"], "Bomber Jacket": ["Bomber", "Bómber", "Blouson aviateur"],
  Shacket: ["Giacca camicia", "Sobrecamisa", "Surchemise"], Cape: ["Mantella", "Capa", "Cape"], Vest: ["Gilet", "Chaleco", "Gilet"],
  Sneakers: ["Sneakers", "Zapatillas", "Baskets"], "Running Shoes": ["Scarpe da corsa", "Zapatillas de running", "Chaussures de running"],
  Sandals: ["Sandali", "Sandalias", "Sandales"], Flats: ["Ballerine", "Bailarinas", "Ballerines"], Loafers: ["Mocassini", "Mocasines", "Mocassins"],
  Pumps: ["Décolleté", "Salones", "Escarpins"], Boots: ["Stivali", "Botas", "Bottes"], "Chelsea Boots": ["Chelsea boots", "Botines Chelsea", "Bottines Chelsea"],
  "Combat Boots": ["Anfibi", "Botas militares", "Rangers"], "Ankle Boots": ["Stivaletti", "Botines", "Bottines"], "Knee Boots": ["Stivali al ginocchio", "Botas altas", "Bottes hautes"],
  "Over-the-Knee Boots": ["Stivali sopra il ginocchio", "Botas mosqueteras", "Cuissardes"], Espadrilles: ["Espadrillas", "Alpargatas", "Espadrilles"],
  Slides: ["Ciabatte", "Chanclas de pala", "Mules de piscine"], Mules: ["Mules", "Mules", "Mules"], Wedges: ["Zeppe", "Cuñas", "Compensées"],
  Clogs: ["Zoccoli", "Zuecos", "Sabots"], Slippers: ["Pantofole", "Zapatillas de casa", "Chaussons"], "Flip Flops": ["Infradito", "Chanclas", "Tongs"],
  Tote: ["Borsa tote", "Bolso tote", "Cabas"], Crossbody: ["Borsa a tracolla", "Bandolera", "Sac bandoulière"], "Shoulder Bag": ["Borsa a spalla", "Bolso de hombro", "Sac porté épaule"],
  Clutch: ["Pochette", "Clutch", "Pochette"], Backpack: ["Zaino", "Mochila", "Sac à dos"], "Bucket Bag": ["Borsa a secchiello", "Bolso saco", "Sac seau"],
  "Belt Bag": ["Marsupio", "Riñonera", "Sac banane"], Satchel: ["Cartella", "Cartera", "Cartable"], "Hobo Bag": ["Borsa hobo", "Bolso hobo", "Sac hobo"],
  "Top Handle Bag": ["Borsa a mano", "Bolso de mano", "Sac à main"],
  Belt: ["Cintura", "Cinturón", "Ceinture"], Scarf: ["Sciarpa", "Bufanda", "Écharpe"], Hat: ["Cappello", "Sombrero", "Chapeau"], Cap: ["Berretto", "Gorra", "Casquette"],
  Gloves: ["Guanti", "Guantes", "Gants"], Watch: ["Orologio", "Reloj", "Montre"], Sunglasses: ["Occhiali da sole", "Gafas de sol", "Lunettes de soleil"],
  "Hair Accessory": ["Accessorio per capelli", "Accesorio para el pelo", "Accessoire cheveux"], Tie: ["Cravatta", "Corbata", "Cravate"],
  Earrings: ["Orecchini", "Pendientes", "Boucles d'oreilles"], Necklace: ["Collana", "Collar", "Collier"], Bracelet: ["Bracciale", "Pulsera", "Bracelet"],
  Ring: ["Anello", "Anillo", "Bague"], Brooch: ["Spilla", "Broche", "Broche"], Anklet: ["Cavigliera", "Tobillera", "Bracelet de cheville"],
  Bra: ["Reggiseno", "Sujetador", "Soutien-gorge"], "Sports Bra": ["Reggiseno sportivo", "Sujetador deportivo", "Brassière de sport"],
  Briefs: ["Slip", "Braguitas", "Culotte"], Panties: ["Mutandine", "Bragas", "Culotte"], Boxers: ["Boxer", "Bóxers", "Boxer"],
  Shapewear: ["Intimo modellante", "Faja", "Gainant"], Sleepwear: ["Pigiama", "Pijama", "Pyjama"], Socks: ["Calzini", "Calcetines", "Chaussettes"],
  Tights: ["Collant", "Medias", "Collants"],
  "One-piece Swimsuit": ["Costume intero", "Bañador", "Maillot une pièce"], "Bikini Top": ["Reggiseno bikini", "Top de bikini", "Haut de bikini"],
  "Bikini Bottom": ["Slip bikini", "Braga de bikini", "Bas de bikini"], "Cover-up": ["Copricostume", "Pareo", "Cache-maillot"],
  "Swim Shorts": ["Pantaloncini da bagno", "Bañador short", "Short de bain"],
  "Training Top": ["Top sportivo", "Camiseta deportiva", "Haut de sport"], "Performance Jacket": ["Giacca sportiva", "Chaqueta deportiva", "Veste de sport"],
  "Running Shorts": ["Shorts da corsa", "Pantalón corto de running", "Short de running"], "Bike Shorts": ["Ciclisti", "Mallas ciclistas", "Cycliste"],
  "Training Leggings": ["Leggings sportivi", "Mallas deportivas", "Legging de sport"], "Tennis Skirt": ["Gonnellino da tennis", "Falda de tenis", "Jupe de tennis"],
  Tracksuit: ["Tuta sportiva", "Chándal", "Survêtement"],
  // Categories, for labels that fall back to the category.
  Tops: ["Top", "Tops", "Hauts"], Bottoms: ["Pantaloni e gonne", "Pantalones y faldas", "Bas"], Dresses: ["Abiti", "Vestidos", "Robes"],
  Jumpsuits: ["Tute", "Monos", "Combinaisons"], Outerwear: ["Capispalla", "Abrigos", "Manteaux et vestes"], Shoes: ["Scarpe", "Zapatos", "Chaussures"],
  Bags: ["Borse", "Bolsos", "Sacs"], Accessories: ["Accessori", "Accesorios", "Accessoires"], Underwear: ["Intimo", "Ropa interior", "Lingerie"],
  Swimwear: ["Costumi", "Baño", "Maillots"], Activewear: ["Abbigliamento sportivo", "Ropa deportiva", "Sport"],
};

// Grammatical gender and number of each garment type, per language (m/f, s/p), so the colour after
// it agrees: "sandali neri", "borsa nera", "sandalias negras", "sandales noires".
type GN = "ms" | "fs" | "mp" | "fp";
const GENDER: Record<string, [GN, GN, GN]> = {
  "T-Shirt": ["fs", "fs", "ms"], Shirt: ["fs", "fs", "fs"], Blouse: ["fs", "fs", "ms"], "Tank Top": ["fs", "fs", "ms"], Camisole: ["ms", "fs", "ms"],
  "Crop Top": ["ms", "ms", "ms"], Bodysuit: ["ms", "ms", "ms"], Polo: ["fs", "ms", "ms"], Sweater: ["ms", "ms", "ms"], Cardigan: ["ms", "ms", "ms"],
  Hoodie: ["fs", "fs", "ms"], Sweatshirt: ["fs", "fs", "ms"], "Vest Top": ["fs", "fs", "ms"], "Knit Top": ["ms", "ms", "ms"], Tunic: ["fs", "fs", "fs"],
  Jeans: ["mp", "mp", "ms"], Trousers: ["mp", "mp", "ms"], "Cargo Pants": ["mp", "mp", "ms"], Joggers: ["mp", "mp", "ms"], Leggings: ["mp", "mp", "ms"],
  Shorts: ["mp", "mp", "ms"], "Bermuda Shorts": ["mp", "fp", "ms"], Skirt: ["fs", "fs", "fs"],
  "Slip Dress": ["ms", "ms", "fs"], "Shirt Dress": ["ms", "ms", "fs"], "Wrap Dress": ["ms", "ms", "fs"], "Bodycon Dress": ["ms", "ms", "fs"],
  "A-line Dress": ["ms", "ms", "fs"], "Shift Dress": ["ms", "ms", "fs"], "Sweater Dress": ["ms", "ms", "fs"], "Evening Dress": ["ms", "ms", "fs"],
  Jumpsuit: ["fs", "ms", "fs"], Playsuit: ["fs", "ms", "ms"], Romper: ["ms", "ms", "fs"],
  Blazer: ["ms", "fs", "ms"], Coat: ["ms", "ms", "ms"], "Trench Coat": ["ms", "fs", "ms"], "Puffer Jacket": ["ms", "ms", "fs"], Parka: ["ms", "fs", "fs"],
  "Rain Jacket": ["ms", "ms", "ms"], Windbreaker: ["fs", "ms", "ms"], "Denim Jacket": ["fs", "fs", "fs"], "Leather Jacket": ["fs", "fs", "fs"],
  "Bomber Jacket": ["ms", "fs", "ms"], Shacket: ["fs", "fs", "fs"], Cape: ["fs", "fs", "fs"], Vest: ["ms", "ms", "ms"],
  Sneakers: ["fp", "fp", "fp"], "Running Shoes": ["fp", "fp", "fp"], Sandals: ["mp", "fp", "fp"], Flats: ["fp", "fp", "fp"], Loafers: ["mp", "mp", "mp"],
  Pumps: ["fp", "mp", "mp"], Boots: ["mp", "fp", "fp"], "Chelsea Boots": ["mp", "mp", "fp"], "Combat Boots": ["mp", "fp", "mp"], "Ankle Boots": ["mp", "mp", "fp"],
  "Knee Boots": ["mp", "fp", "fp"], "Over-the-Knee Boots": ["mp", "fp", "fp"], Espadrilles: ["fp", "fp", "fp"], Slides: ["fp", "fp", "fp"], Mules: ["fp", "fp", "fp"],
  Wedges: ["fp", "fp", "fp"], Clogs: ["mp", "mp", "mp"], Slippers: ["fp", "fp", "mp"], "Flip Flops": ["mp", "fp", "fp"],
  Tote: ["fs", "ms", "ms"], Crossbody: ["fs", "fs", "ms"], "Shoulder Bag": ["fs", "ms", "ms"], Clutch: ["fs", "ms", "fs"], Backpack: ["ms", "fs", "ms"],
  "Bucket Bag": ["fs", "ms", "ms"], "Belt Bag": ["ms", "fs", "ms"], Satchel: ["fs", "fs", "ms"], "Hobo Bag": ["fs", "ms", "ms"], "Top Handle Bag": ["fs", "ms", "ms"],
  Belt: ["fs", "ms", "fs"], Scarf: ["fs", "fs", "fs"], Hat: ["ms", "ms", "ms"], Cap: ["ms", "fs", "fs"], Gloves: ["mp", "mp", "mp"], Watch: ["ms", "ms", "fs"],
  Sunglasses: ["mp", "fp", "fp"], "Hair Accessory": ["ms", "ms", "ms"], Tie: ["fs", "fs", "fs"], Earrings: ["mp", "mp", "fp"], Necklace: ["fs", "ms", "ms"],
  Bracelet: ["ms", "fs", "ms"], Ring: ["ms", "ms", "fs"], Brooch: ["fs", "ms", "fs"], Anklet: ["fs", "fs", "ms"],
  Bra: ["ms", "ms", "ms"], "Sports Bra": ["ms", "ms", "fs"], Briefs: ["ms", "fp", "fs"], Panties: ["fp", "fp", "fs"], Boxers: ["mp", "mp", "ms"],
  Shapewear: ["ms", "fs", "ms"], Sleepwear: ["ms", "ms", "ms"], Socks: ["mp", "mp", "fp"], Tights: ["mp", "fp", "mp"],
  "One-piece Swimsuit": ["ms", "ms", "ms"], "Bikini Top": ["ms", "ms", "ms"], "Bikini Bottom": ["ms", "fs", "ms"], "Cover-up": ["ms", "ms", "ms"], "Swim Shorts": ["mp", "ms", "ms"],
  "Training Top": ["ms", "fs", "ms"], "Performance Jacket": ["fs", "fs", "fs"], "Running Shorts": ["mp", "ms", "ms"], "Bike Shorts": ["mp", "fp", "ms"],
  "Training Leggings": ["mp", "fp", "ms"], "Tennis Skirt": ["ms", "fs", "fs"], Tracksuit: ["fs", "ms", "ms"],
  Tops: ["ms", "mp", "mp"], Bottoms: ["mp", "mp", "mp"], Dresses: ["mp", "mp", "fp"], Jumpsuits: ["fp", "mp", "fp"], Outerwear: ["mp", "mp", "mp"],
  Shoes: ["fp", "mp", "fp"], Bags: ["fp", "mp", "mp"], Accessories: ["mp", "mp", "mp"], Underwear: ["ms", "fs", "fs"], Swimwear: ["mp", "ms", "mp"], Activewear: ["ms", "fs", "ms"],
};

// Prints read as "a righe", "de rayas", "à rayures" after the garment, not as a colour word.
const PATTERN_AFTER: Record<string, [string, string, string]> = {
  striped: ["a righe", "de rayas", "à rayures"], checkered: ["a quadri", "de cuadros", "à carreaux"],
  floral: ["a fiori", "de flores", "à fleurs"], "animal print": ["animalier", "animal print", "à imprimé animal"],
  "tie dye": ["tie-dye", "tie-dye", "tie-dye"], "denim wash": ["lavaggio denim", "lavado denim", "délavé denim"],
};

// Single-word colour adjectives that agree with the garment; every other colour (rosa, blu,
// beige, bordeaux, compound names like "rosso ciliegia") stays invariable after the noun.
const AGREE: Record<Lang, Record<string, [string, string, string, string]>> = {
  it: {
    nero: ["nero", "nera", "neri", "nere"], bianco: ["bianco", "bianca", "bianchi", "bianche"], rosso: ["rosso", "rossa", "rossi", "rosse"],
    giallo: ["giallo", "gialla", "gialli", "gialle"], grigio: ["grigio", "grigia", "grigi", "grigie"], azzurro: ["azzurro", "azzurra", "azzurri", "azzurre"],
    verde: ["verde", "verde", "verdi", "verdi"], marrone: ["marrone", "marrone", "marroni", "marroni"], arancione: ["arancione", "arancione", "arancioni", "arancioni"],
    celeste: ["celeste", "celeste", "celesti", "celesti"],
  },
  es: {
    negro: ["negro", "negra", "negros", "negras"], blanco: ["blanco", "blanca", "blancos", "blancas"], rojo: ["rojo", "roja", "rojos", "rojas"],
    amarillo: ["amarillo", "amarilla", "amarillos", "amarillas"], gris: ["gris", "gris", "grises", "grises"], verde: ["verde", "verde", "verdes", "verdes"],
    azul: ["azul", "azul", "azules", "azules"], "marrón": ["marrón", "marrón", "marrones", "marrones"], morado: ["morado", "morada", "morados", "moradas"],
    crudo: ["crudo", "cruda", "crudos", "crudas"], "marfil": ["marfil", "marfil", "marfil", "marfil"],
  },
  fr: {
    noir: ["noir", "noire", "noirs", "noires"], blanc: ["blanc", "blanche", "blancs", "blanches"], gris: ["gris", "grise", "gris", "grises"],
    vert: ["vert", "verte", "verts", "vertes"], bleu: ["bleu", "bleue", "bleus", "bleues"], rouge: ["rouge", "rouge", "rouges", "rouges"],
    jaune: ["jaune", "jaune", "jaunes", "jaunes"], rose: ["rose", "rose", "roses", "roses"], violet: ["violet", "violette", "violets", "violettes"],
    fauve: ["fauve", "fauve", "fauves", "fauves"], beige: ["beige", "beige", "beiges", "beiges"],
  },
};

const LANG_INDEX: Record<Lang, 0 | 1 | 2> = { it: 0, es: 1, fr: 2 };
const lower = (m: Names) => new Map(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]));
const COLOR_MAP = lower(COLORS);
const NAME_MAP = lower(SUBCATEGORIES);
const GENDER_MAP = new Map(Object.entries(GENDER).map(([k, v]) => [k.toLowerCase(), v]));

function langOf(language: string | null | undefined): Lang | null {
  const l = (language ?? "").slice(0, 2).toLowerCase();
  return l === "it" || l === "es" || l === "fr" ? l : null;
}

/** Whether a colour / garment name has translations (for tests and fallbacks). */
export const hasColorName = (name: string) => COLOR_MAP.has(name.trim().toLowerCase());
export const hasGarmentName = (name: string) => NAME_MAP.has(name.trim().toLowerCase());
export const hasGarmentGender = (name: string) => GENDER_MAP.has(name.trim().toLowerCase());

/** A colour name (palette or plain word) in the language; unknown names unchanged. */
export function colorName(name: string, language: string | null | undefined): string {
  const l = langOf(language);
  const hit = l ? COLOR_MAP.get(name.trim().toLowerCase()) : undefined;
  return hit ? hit[LANG_INDEX[l!]] : name;
}

/** A garment type or category in the language; unknown names unchanged. */
export function garmentName(name: string, language: string | null | undefined): string {
  const l = langOf(language);
  const hit = l ? NAME_MAP.get(name.trim().toLowerCase()) : undefined;
  return hit ? hit[LANG_INDEX[l!]] : name;
}

/** A colour as it reads after a garment of that gender/number: "neri", "nera", "rosso ciliegia",
 *  "a righe". */
export function colorAfterGarment(color: string, garment: string, language: string | null | undefined): string {
  const l = langOf(language);
  if (!l) return color;
  const key = color.trim().toLowerCase();
  const pattern = PATTERN_AFTER[key];
  if (pattern) return pattern[LANG_INDEX[l]];
  const word = colorName(color, l).toLowerCase();
  if (word.includes(" ")) return word; // compound colours stay invariable
  const gn = GENDER_MAP.get(garment.trim().toLowerCase())?.[LANG_INDEX[l]] ?? "ms";
  const forms = AGREE[l][word];
  return forms ? forms[["ms", "fs", "mp", "fp"].indexOf(gn)] : word;
}

/** "Aquazzura · Jet Black · Sandals" → "Aquazzura · Sandali neri" (Italian), "Aquazzura ·
 *  Sandalias negras", "Aquazzura · Sandales noires": the garment type with its colour after it,
 *  agreeing as the language wants; brands and models stay as written. English is unchanged. */
export function localizeLabel(label: string, language: string | null | undefined): string {
  const l = langOf(language);
  if (!l) return label;
  const parts = label.split(" · ");
  const colorIdx = parts.findIndex((p) => hasColorName(p) || PATTERN_AFTER[p.trim().toLowerCase()] != null);
  const typeIdx = parts.findIndex((p, i) => i !== colorIdx && hasGarmentName(p));
  if (colorIdx >= 0 && typeIdx >= 0) {
    const merged = `${garmentName(parts[typeIdx], l)} ${colorAfterGarment(parts[colorIdx], parts[typeIdx], l)}`;
    return parts.flatMap((p, i) => (i === colorIdx ? [] : i === typeIdx ? [merged] : [p])).join(" · ");
  }
  return parts.map((p) => (hasColorName(p) ? colorName(p, l) : garmentName(p, l))).join(" · ");
}
