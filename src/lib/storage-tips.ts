// Consigli per il cambio armadio — shown from the Cambio armadio view in Wardrobe. Plain editorial
// advice, the same for everyone: no products, brands or links, only the kind of container to look for.
import { BRAND_NAME } from "./brand";

export type StorageTipsSection = { id: string; title: string; tips: string[] };
export type StorageTips = { title: string; intro: string; sections: StorageTipsSection[] };

const it: StorageTips = {
  title: "Consigli per il cambio armadio",
  intro: "Pochi accorgimenti perché i capi ritornino come li hai lasciati: puliti, senza pieghe e senza tarme.",
  sections: [
    {
      id: "before",
      title: "Prima di mettere via",
      tips: [
        "Lava o fai pulire tutto, anche ciò che sembra pulito: sudore, profumo e piccole macchie col tempo ingialliscono e attirano le tarme.",
        "Fai asciugare completamente ogni capo: anche poca umidità chiusa in una scatola fa muffa.",
        "Ripara adesso bottoni, orli e cuciture: alla prossima stagione il capo sarà pronto da mettere.",
        "Fai una selezione: ciò che non hai mai messo in tutta la stagione puoi archiviarlo, regalarlo o venderlo invece di riporlo.",
        "Svuota le tasche e chiudi zip e bottoni, così i capi mantengono la forma.",
      ],
    },
    {
      id: "fold",
      title: "Come piegare",
      tips: [
        "Maglioni e maglieria: sempre piegati, mai appesi, perché le grucce deformano le spalle. Piega le maniche verso il centro, poi il capo in tre.",
        "Camicie: abbottona il primo bottone e uno a metà, gira le maniche sul retro e piega in tre dal basso verso il colletto.",
        "Pantaloni: piegali lungo la piega centrale, poi in due o in tre.",
        "T-shirt, capi sportivi e intimo: arrotolarli fa risparmiare spazio e lascia meno segni.",
        "Seta e capi delicati: metti un foglio di carta velina senza acidi tra le pieghe per non segnare il tessuto.",
        "Cappotti, blazer e abiti strutturati: lasciali appesi su grucce sagomate, nella loro custodia, invece di piegarli.",
        "Metti i capi più pesanti sul fondo e quelli leggeri sopra, senza schiacciare troppo.",
      ],
    },
    {
      id: "containers",
      title: "Contenitori da acquistare",
      tips: [
        "Sacche o scatole in cotone o in tessuto non tessuto traspirante, meglio se con una finestrella: le più adatte per lana, cashmere e seta.",
        "Sacchetti sottovuoto: utili per capi sintetici e voluminosi, come pile, imbottiti sintetici e coperte. Evitali per lana, cashmere, piumini in piuma d'oca e pelle, che si schiacciano e hanno bisogno di respirare.",
        "Custodie per abiti in tessuto traspirante per cappotti e capi eleganti: la plastica della lavanderia trattiene l'umidità, toglila sempre.",
        "Scatole per scarpe, trasparenti o con un'etichetta; dentro le scarpe carta o forme in legno di cedro per tenerne la forma.",
        "Per le borse: imbottiscile con carta e riponile nella loro sacca antipolvere, in piedi.",
        "Contenitori in plastica rigida con coperchio solo per luoghi umidi come garage e cantine, sempre con un assorbiumidità dentro.",
        "Etichette su ogni scatola, per sapere cosa contiene senza aprirla.",
      ],
    },
    {
      id: "where",
      title: "Dove e come conservare",
      tips: [
        "Scegli un posto fresco, asciutto e al buio: la luce scolorisce i tessuti, il caldo e l'umidità li rovinano.",
        "In garage o in cantina tieni le scatole sollevate da terra e lontane dai muri, e cambia l'assorbiumidità quando è pieno.",
        "Contro le tarme usa cedro o sacchetti di lavanda; ravviva il cedro con un po' di carta vetrata a ogni stagione.",
        "Non riempire troppo le scatole: i capi pressati si segnano e non respirano.",
        "A metà stagione dai un'occhiata veloce, per accorgerti in tempo di umidità o tarme.",
      ],
    },
    {
      id: "app",
      title: `Con ${BRAND_NAME}`,
      tips: [
        "Tocca «Seleziona», scegli i capi che metti via e tocca «Cambio armadio»: non verranno più proposti nei look, nei piani e nei viaggi.",
        "Quando cambia la stagione apri il Cambio armadio, seleziona i capi e tocca «Riporta nell'armadio».",
      ],
    },
  ],
};

const en: StorageTips = {
  title: "Seasonal storage tips",
  intro: "A few habits so your pieces come back the way you left them: clean, crease-free and moth-free.",
  sections: [
    {
      id: "before",
      title: "Before you put things away",
      tips: [
        "Wash or dry-clean everything, even what looks clean: sweat, perfume and small stains turn yellow over time and attract moths.",
        "Let every piece dry completely: even a little moisture sealed in a box causes mould.",
        "Fix buttons, hems and seams now, so the piece is ready to wear next season.",
        "Sort as you go: what you never wore all season can be archived, given away or sold instead of stored.",
        "Empty the pockets and close zips and buttons, so pieces keep their shape.",
      ],
    },
    {
      id: "fold",
      title: "How to fold",
      tips: [
        "Knitwear: always folded, never hung, because hangers stretch the shoulders. Fold the sleeves to the centre, then the piece in three.",
        "Shirts: do up the top button and one in the middle, fold the sleeves behind and fold in three from the hem up to the collar.",
        "Trousers: fold along the centre crease, then in half or in three.",
        "T-shirts, sportswear and underwear: rolling them saves space and leaves fewer creases.",
        "Silk and delicates: lay a sheet of acid-free tissue paper between the folds so the fabric isn't marked.",
        "Coats, blazers and structured pieces: keep them hanging on shaped hangers in their cover instead of folding them.",
        "Put heavier pieces at the bottom and lighter ones on top, without packing them too tight.",
      ],
    },
    {
      id: "containers",
      title: "Containers to buy",
      tips: [
        "Bags or boxes in cotton or breathable non-woven fabric, ideally with a window: the best choice for wool, cashmere and silk.",
        "Vacuum bags: useful for bulky synthetics such as fleece, synthetic padded jackets and blankets. Avoid them for wool, cashmere, down jackets and leather, which get crushed and need to breathe.",
        "Breathable fabric garment covers for coats and smart pieces: dry-cleaner plastic traps moisture, always take it off.",
        "Shoe boxes, clear or labelled; paper or cedar shoe trees inside to keep the shape.",
        "For bags: stuff them with paper and store them upright in their dust bag.",
        "Rigid plastic boxes with a lid only for damp places such as garages and cellars, always with a moisture absorber inside.",
        "A label on every box, so you know what's inside without opening it.",
      ],
    },
    {
      id: "where",
      title: "Where and how to store",
      tips: [
        "Pick a cool, dry, dark place: light fades fabrics, heat and damp damage them.",
        "In a garage or cellar keep boxes off the floor and away from walls, and replace the moisture absorber when it's full.",
        "Against moths use cedar or lavender sachets; refresh cedar with a little sandpaper every season.",
        "Don't overfill boxes: pressed pieces crease and can't breathe.",
        "Take a quick look halfway through the season, to catch damp or moths in time.",
      ],
    },
    {
      id: "app",
      title: `With ${BRAND_NAME}`,
      tips: [
        "Tap “Select”, choose the pieces you're putting away and tap “Storage”: they won't be suggested in looks, plans or trips any more.",
        "When the season changes, open Seasonal storage, select the pieces and tap “Bring back”.",
      ],
    },
  ],
};

const fr: StorageTips = {
  title: "Conseils pour le rangement saisonnier",
  intro: "Quelques gestes pour retrouver vos pièces comme vous les avez laissées : propres, sans plis et sans mites.",
  sections: [
    {
      id: "before",
      title: "Avant de ranger",
      tips: [
        "Lavez ou faites nettoyer tout, même ce qui semble propre : la transpiration, le parfum et les petites taches jaunissent avec le temps et attirent les mites.",
        "Laissez chaque pièce sécher complètement : un peu d'humidité enfermée dans une boîte suffit à faire des moisissures.",
        "Réparez dès maintenant boutons, ourlets et coutures : la pièce sera prête à porter à la saison suivante.",
        "Faites le tri : ce que vous n'avez jamais porté de la saison peut être archivé, donné ou vendu au lieu d'être rangé.",
        "Videz les poches et fermez fermetures éclair et boutons pour que les pièces gardent leur forme.",
      ],
    },
    {
      id: "fold",
      title: "Comment plier",
      tips: [
        "Pulls et maille : toujours pliés, jamais suspendus, car les cintres déforment les épaules. Repliez les manches vers le centre, puis la pièce en trois.",
        "Chemises : fermez le premier bouton et un au milieu, repliez les manches dans le dos et pliez en trois du bas vers le col.",
        "Pantalons : pliez-les le long du pli central, puis en deux ou en trois.",
        "T-shirts, vêtements de sport et sous-vêtements : les rouler fait gagner de la place et laisse moins de marques.",
        "Soie et pièces délicates : glissez une feuille de papier de soie sans acide entre les plis pour ne pas marquer le tissu.",
        "Manteaux, blazers et pièces structurées : laissez-les suspendus sur des cintres galbés, dans leur housse, plutôt que de les plier.",
        "Mettez les pièces lourdes au fond et les légères dessus, sans trop tasser.",
      ],
    },
    {
      id: "containers",
      title: "Contenants à acheter",
      tips: [
        "Sacs ou boîtes en coton ou en tissu non tissé respirant, de préférence avec une fenêtre : les plus adaptés à la laine, au cachemire et à la soie.",
        "Sacs sous vide : pratiques pour les synthétiques volumineux comme la polaire, les doudounes synthétiques et les couvertures. À éviter pour la laine, le cachemire, les doudounes en duvet et le cuir, qui s'écrasent et ont besoin de respirer.",
        "Housses en tissu respirant pour les manteaux et les pièces habillées : le plastique du pressing retient l'humidité, retirez-le toujours.",
        "Boîtes à chaussures transparentes ou étiquetées ; du papier ou des embauchoirs en cèdre à l'intérieur pour garder la forme.",
        "Pour les sacs : rembourrez-les de papier et rangez-les debout dans leur housse anti-poussière.",
        "Boîtes en plastique rigide avec couvercle seulement pour les lieux humides comme le garage ou la cave, toujours avec un absorbeur d'humidité.",
        "Une étiquette sur chaque boîte, pour savoir ce qu'elle contient sans l'ouvrir.",
      ],
    },
    {
      id: "where",
      title: "Où et comment ranger",
      tips: [
        "Choisissez un endroit frais, sec et sombre : la lumière décolore les tissus, la chaleur et l'humidité les abîment.",
        "Au garage ou à la cave, surélevez les boîtes, éloignez-les des murs et changez l'absorbeur d'humidité quand il est plein.",
        "Contre les mites, utilisez du cèdre ou des sachets de lavande ; ravivez le cèdre avec un peu de papier de verre à chaque saison.",
        "Ne remplissez pas trop les boîtes : les pièces tassées se marquent et ne respirent pas.",
        "À mi-saison, jetez un coup d'œil rapide pour repérer à temps l'humidité ou les mites.",
      ],
    },
    {
      id: "app",
      title: `Avec ${BRAND_NAME}`,
      tips: [
        "Touchez « Sélectionner », choisissez les pièces que vous rangez et touchez « Ranger » : elles ne seront plus proposées dans les looks, les plannings et les voyages.",
        "Au changement de saison, ouvrez le Rangement saisonnier, sélectionnez les pièces et touchez « Remettre ».",
      ],
    },
  ],
};

const es: StorageTips = {
  title: "Consejos para el cambio de armario",
  intro: "Unos pocos gestos para que tus prendas vuelvan como las dejaste: limpias, sin arrugas y sin polillas.",
  sections: [
    {
      id: "before",
      title: "Antes de guardar",
      tips: [
        "Lava o lleva a la tintorería todo, incluso lo que parece limpio: el sudor, el perfume y las manchas pequeñas amarillean con el tiempo y atraen a las polillas.",
        "Deja que cada prenda se seque del todo: un poco de humedad cerrada en una caja basta para que salga moho.",
        "Arregla ahora botones, bajos y costuras: la próxima temporada la prenda estará lista para usar.",
        "Haz una selección: lo que no te has puesto en toda la temporada puedes archivarlo, regalarlo o venderlo en lugar de guardarlo.",
        "Vacía los bolsillos y cierra cremalleras y botones para que las prendas mantengan la forma.",
      ],
    },
    {
      id: "fold",
      title: "Cómo doblar",
      tips: [
        "Jerséis y punto: siempre doblados, nunca colgados, porque las perchas deforman los hombros. Dobla las mangas hacia el centro y luego la prenda en tres.",
        "Camisas: abrocha el primer botón y uno a media altura, lleva las mangas hacia atrás y dobla en tres desde abajo hacia el cuello.",
        "Pantalones: dóblalos por la raya central y luego en dos o en tres.",
        "Camisetas, ropa deportiva y ropa interior: enrollarlas ahorra espacio y deja menos marcas.",
        "Seda y prendas delicadas: pon una hoja de papel de seda sin ácido entre los pliegues para no marcar el tejido.",
        "Abrigos, americanas y prendas estructuradas: déjalos colgados en perchas con forma, dentro de su funda, en lugar de doblarlos.",
        "Pon las prendas pesadas al fondo y las ligeras encima, sin apretar demasiado.",
      ],
    },
    {
      id: "containers",
      title: "Contenedores que comprar",
      tips: [
        "Bolsas o cajas de algodón o de tejido no tejido transpirable, mejor con una ventanita: las más adecuadas para lana, cachemir y seda.",
        "Bolsas al vacío: útiles para prendas sintéticas voluminosas como forros polares, plumíferos sintéticos y mantas. Evítalas para lana, cachemir, plumíferos de pluma y piel, que se aplastan y necesitan respirar.",
        "Fundas de tela transpirable para abrigos y prendas de vestir: el plástico de la tintorería retiene la humedad, quítalo siempre.",
        "Cajas para zapatos, transparentes o con etiqueta; dentro, papel o hormas de madera de cedro para mantener la forma.",
        "Para los bolsos: rellénalos con papel y guárdalos de pie en su funda antipolvo.",
        "Cajas de plástico rígido con tapa solo para sitios húmedos como garajes y trasteros, siempre con un absorbe-humedad dentro.",
        "Una etiqueta en cada caja, para saber qué contiene sin abrirla.",
      ],
    },
    {
      id: "where",
      title: "Dónde y cómo guardar",
      tips: [
        "Elige un sitio fresco, seco y oscuro: la luz destiñe los tejidos, el calor y la humedad los estropean.",
        "En el garaje o el trastero, levanta las cajas del suelo, apártalas de las paredes y cambia el absorbe-humedad cuando esté lleno.",
        "Contra las polillas usa cedro o saquitos de lavanda; reaviva el cedro con un poco de papel de lija cada temporada.",
        "No llenes demasiado las cajas: las prendas apretadas se marcan y no respiran.",
        "A mitad de temporada echa un vistazo rápido para detectar a tiempo humedad o polillas.",
      ],
    },
    {
      id: "app",
      title: `Con ${BRAND_NAME}`,
      tips: [
        "Toca «Seleccionar», elige las prendas que guardas y toca «Cambio de armario»: ya no se propondrán en looks, planes ni viajes.",
        "Cuando cambie la temporada, abre el Cambio de armario, selecciona las prendas y toca «Devolver».",
      ],
    },
  ],
};

const TIPS: Record<string, StorageTips> = { it, en, fr, es };

export function storageTipsFor(language: string | undefined): StorageTips {
  const base = (language ?? "").slice(0, 2).toLowerCase();
  return TIPS[base] ?? en;
}

export const STORAGE_TIPS_LANGUAGES = Object.keys(TIPS);
