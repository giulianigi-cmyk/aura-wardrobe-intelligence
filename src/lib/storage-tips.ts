// Consigli per il cambio stagione — shown from the Cambio stagione view in Wardrobe. Plain editorial
// advice, the same for everyone: no products, brands or links, only the kind of container to look for.
import { BRAND_NAME } from "./brand";

export type StorageTipsSection = { id: string; title: string; tips: string[] };

/** The step-by-step folding drawings, all together at the end of the tips (FoldingDiagram.tsx). */
export const FOLD_DIAGRAMS = ["sweater", "shirt", "trousers", "roll", "jacket", "socks", "briefs", "boxers", "bra"] as const;
export type FoldDiagramKind = (typeof FOLD_DIAGRAMS)[number];

/** The drawings for this person: bras only for women, boxers only for men; no gender set, all of them. */
export function foldDiagramsFor(gender: string | null | undefined): FoldDiagramKind[] {
  return FOLD_DIAGRAMS.filter((k) => !(k === "bra" && gender === "Man") && !(k === "boxers" && gender === "Woman"));
}
export type StorageTips = {
  title: string;
  intro: string;
  sections: StorageTipsSection[];
  diagramsTitle: string;
  diagramLabels: Record<FoldDiagramKind, string>;
};

const it: StorageTips = {
  title: "Consigli per il cambio stagione",
  intro: "Pochi accorgimenti perché i capi ritornino come li hai lasciati: puliti, senza pieghe e senza tarme.",
  diagramsTitle: "Come piegare, passo passo",
  diagramLabels: { sweater: "Maglione", shirt: "Camicia", trousers: "Pantaloni", roll: "T-shirt arrotolata", jacket: "Giacca (se non puoi appenderla)", socks: "Calzini", briefs: "Slip e mutande", boxers: "Boxer", bra: "Reggiseno" },
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
        "Giacche, se non puoi appenderle: rovescia una spalla e infilaci dentro l'altra, poi piega a metà. Così la parte esterna resta protetta e le spalle non si schiacciano.",
        "Calzini: sovrapponi i due calzini, piegali a metà e infila la seconda metà nel bordo del primo. Non arrotolare il bordo su se stesso: l'elastico si sforma.",
        "Slip, mutande e boxer: piega i lati verso il centro, poi dal basso verso l'elastico.",
        "Reggiseni: non piegarli mai a metà se hanno le coppe imbottite o il ferretto. Metti una coppa dentro l'altra e infila spalline e fascia nella coppa.",
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
        "Tocca «Seleziona», scegli i capi che metti via e tocca «Cambio stagione»: non verranno più proposti nei look, nei piani e nei viaggi.",
        "Quando cambia la stagione apri Cambio stagione, seleziona i capi e tocca «Riporta nell'armadio».",
      ],
    },
  ],
};

const en: StorageTips = {
  title: "Seasonal storage tips",
  intro: "A few habits so your pieces come back the way you left them: clean, crease-free and moth-free.",
  diagramsTitle: "How to fold, step by step",
  diagramLabels: { sweater: "Sweater", shirt: "Shirt", trousers: "Trousers", roll: "Rolled T-shirt", jacket: "Jacket (if you can't hang it)", socks: "Socks", briefs: "Briefs and knickers", boxers: "Boxers", bra: "Bra" },
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
        "Jackets, if you can't hang them: turn one shoulder inside out and tuck the other shoulder into it, then fold in half. The outside stays protected and the shoulders don't get crushed.",
        "Socks: lay the pair on top of each other, fold in half and tuck the second half into the cuff of the first. Don't roll the cuff back on itself: the elastic stretches out.",
        "Briefs, knickers and boxers: fold the sides to the centre, then from the bottom up to the waistband.",
        "Bras: never fold them in half if they have padded cups or underwire. Nest one cup inside the other and tuck the straps and band into the cup.",
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
  diagramsTitle: "Comment plier, pas à pas",
  diagramLabels: { sweater: "Pull", shirt: "Chemise", trousers: "Pantalon", roll: "T-shirt roulé", jacket: "Veste (si elle ne peut pas être suspendue)", socks: "Chaussettes", briefs: "Culottes et slips", boxers: "Caleçons", bra: "Soutien-gorge" },
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
        "Vestes, si vous ne pouvez pas les suspendre : retournez une épaule et glissez l'autre épaule dedans, puis pliez en deux. L'extérieur reste protégé et les épaules ne s'écrasent pas.",
        "Chaussettes : superposez la paire, pliez en deux et glissez la seconde moitié dans le bord de la première. Ne roulez pas le bord sur lui-même : l'élastique se détend.",
        "Culottes, slips et caleçons : repliez les côtés vers le centre, puis du bas vers la ceinture.",
        "Soutiens-gorge : ne les pliez jamais en deux s'ils ont des bonnets rembourrés ou des armatures. Emboîtez un bonnet dans l'autre et glissez bretelles et bande dans le bonnet.",
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
  diagramsTitle: "Cómo doblar, paso a paso",
  diagramLabels: { sweater: "Jersey", shirt: "Camisa", trousers: "Pantalón", roll: "Camiseta enrollada", jacket: "Chaqueta (si no puedes colgarla)", socks: "Calcetines", briefs: "Braguitas y calzoncillos", boxers: "Bóxers", bra: "Sujetador" },
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
        "Chaquetas, si no puedes colgarlas: da la vuelta a un hombro y mete el otro hombro dentro, luego dobla por la mitad. El exterior queda protegido y los hombros no se aplastan.",
        "Calcetines: pon uno encima del otro, dóblalos por la mitad y mete la segunda mitad en el borde del primero. No enrolles el borde sobre sí mismo: el elástico se da de sí.",
        "Braguitas, calzoncillos y bóxers: dobla los lados hacia el centro y luego desde abajo hasta la cinturilla.",
        "Sujetadores: no los dobles nunca por la mitad si tienen copas acolchadas o aros. Mete una copa dentro de la otra y guarda tirantes y banda dentro de la copa.",
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

const zh: StorageTips = {
  title: "换季收纳小贴士",
  intro: "几个小习惯，让你的衣物取出来时和收起来时一样：干净、平整、没有虫蛀。",
  diagramsTitle: "一步步学折叠",
  diagramLabels: { sweater: "毛衣", shirt: "衬衫", trousers: "长裤", roll: "卷起的 T 恤", jacket: "外套（无法悬挂时）", socks: "袜子", briefs: "内裤", boxers: "平角内裤", bra: "文胸" },
  sections: [
    {
      id: "before",
      title: "收纳之前",
      tips: [
        "所有衣物都要洗净或干洗，看起来干净的也不例外：汗渍、香水和小污渍久了会发黄，还会招来蛀虫。",
        "每件衣物都要彻底晾干：哪怕一点点湿气封在箱子里，也会发霉。",
        "现在就把扣子、下摆和接缝修好，下一季拿出来就能直接穿。",
        "顺便做个筛选：整季都没穿过的衣物，可以归档、送人或卖掉，不必再收起来。",
        "清空口袋，拉好拉链、扣好扣子，让衣物保持形状。",
      ],
    },
    {
      id: "fold",
      title: "如何折叠",
      tips: [
        "毛衣和针织衫：一定要折叠，不要挂起来，衣架会把肩部撑变形。先把袖子折向中间，再把衣身折成三折。",
        "衬衫：扣好第一颗和中间一颗纽扣，把袖子折到背面，再从下摆向领口折成三折。",
        "长裤：沿中缝对折，再折成两折或三折。",
        "T 恤、运动服和内衣：卷起来收纳更省空间，也更少压痕。",
        "真丝和精致衣物：在折痕之间垫一张无酸薄纸，避免面料留下印痕。",
        "大衣、西装外套和有结构感的衣物：用有弧度的衣架挂好，套上防尘罩，不要折叠。",
        "重的衣物放在下面，轻的放在上面，不要压得太紧。",
        "外套如果无法悬挂：把一侧肩部翻过来，把另一侧肩部塞进去，再对折。这样外面一层受到保护，肩部也不会被压扁。",
        "袜子：两只袜子叠在一起，对折，把后半截塞进第一只的袜口。不要把袜口卷起来翻折：松紧带会被撑松。",
        "内裤和平角内裤：两侧向中间折，再从下往上折到腰头。",
        "文胸：有衬垫或钢圈的文胸千万不要对折。把一个罩杯套进另一个罩杯，再把肩带和下围收进罩杯里。",
      ],
    },
    {
      id: "containers",
      title: "需要购买的收纳用品",
      tips: [
        "棉质或透气无纺布的收纳袋或收纳箱，最好带透明窗口：最适合羊毛、羊绒和真丝。",
        "真空压缩袋：适合抓绒、合成棉服和毯子等蓬松的合成材质。羊毛、羊绒、羽绒服和皮革不要用，它们会被压坏，而且需要透气。",
        "大衣和正式衣物用透气布料防尘罩：干洗店的塑料袋会闷住湿气，一定要取下来。",
        "鞋盒选透明的或贴上标签；鞋里塞纸或放雪松木鞋撑，保持鞋形。",
        "包袋：里面塞纸，竖着放进防尘袋。",
        "带盖的硬质塑料箱只用于车库、地下室等潮湿的地方，而且箱内一定要放除湿剂。",
        "每个箱子都贴上标签，不用打开就知道里面装了什么。",
      ],
    },
    {
      id: "where",
      title: "收在哪里、怎么收",
      tips: [
        "选择阴凉、干燥、避光的地方：光线会让面料褪色，高温和潮湿会损坏面料。",
        "放在车库或地下室时，箱子要离地、远离墙面，除湿剂满了就及时更换。",
        "防蛀可以用雪松木或薰衣草香包；每季用砂纸轻轻打磨雪松木，恢复香气。",
        "箱子不要装得太满：压得太紧的衣物会留下折痕，也无法透气。",
        "季中快速检查一次，及时发现受潮或虫蛀。",
      ],
    },
    {
      id: "app",
      title: `在 ${BRAND_NAME} 中`,
      tips: [
        "点按“选择”，选出你要收起来的单品，再点按“换季收纳”：它们不会再出现在造型、规划和旅行中。",
        "换季时打开“换季收纳”，选择单品，点按“放回衣橱”。",
      ],
    },
  ],
};

const TIPS: Record<string, StorageTips> = { it, en, fr, es, zh };

export function storageTipsFor(language: string | undefined): StorageTips {
  const base = (language ?? "").slice(0, 2).toLowerCase();
  return TIPS[base] ?? en;
}

export const STORAGE_TIPS_LANGUAGES = Object.keys(TIPS);
