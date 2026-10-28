import type { GuideText } from "./guide-structure";
import { BRAND_NAME } from "@/lib/brand";

const text: GuideText = {
  title: `Guida di ${BRAND_NAME}`,
  intro: "Come usare ogni parte dell'app, passo per passo. Accanto a ogni passo vedi il pulsante da toccare, come appare nell'app; con «Apri» ci vai direttamente.",
  searchPlaceholder: "Cerca nella guida…",
  noResults: "Nessun argomento trovato. Prova con un'altra parola.",
  open: "Apri",
  replayTour: "Rivedi il tour dell'app",
  chapters: {
    start: "Primi passi",
    wardrobe: "Il guardaroba",
    outfits: "Outfit e Stylist",
    calendar: "Calendario e viaggi",
    avatar: "Avatar e prova virtuale",
    "colors-shopping": "Colori, acquisti e statistiche",
    community: "Community",
    account: "Account e impostazioni",
  },
  articles: {
    about: {
      title: `Com'è fatta ${BRAND_NAME}`,
      intro: `${BRAND_NAME} è il tuo guardaroba digitale: fotografi i tuoi capi e l'app ti propone cosa indossare, ogni giorno. In basso ci sono sempre cinque sezioni.`,
      steps: [
        "Home: il look di oggi, pensato per il meteo, e le scorciatoie.",
        "Guardaroba: tutti i tuoi capi e il tasto + per aggiungerne.",
        "Stylist: creare outfit, chiedere consiglio e ritrovare i tuoi look.",
        "Calendario: cosa indossare giorno per giorno, impegni e viaggi.",
        "Tu: profilo, avatar, analisi del colore, statistiche e Impostazioni.",
      ],
    },
    "first-pieces": {
      title: "Aggiungere i primi capi",
      intro: "Il modo più veloce è caricare più foto insieme. Inizia dai capi che metti di più.",
      steps: [
        "In Home, nel riquadro Primi passi, tocca «Più foto insieme».",
        "Tocca «Scegli foto» e seleziona dalla galleria fino a 50 foto, una per capo.",
        `${BRAND_NAME} scontorna e riconosce i capi in background: puoi intanto usare l'app o chiuderla.`,
        "Quando il lotto è pronto tocca «Rivedi», controlla i capi e aggiungili al guardaroba.",
      ],
      tip: "Foto su sfondo semplice e con il capo intero danno i risultati migliori.",
    },
    "first-look": {
      title: "Il tuo primo look",
      steps: [
        "Con almeno 3 capi, in Home compare La selezione di oggi: il look del giorno.",
        "Tocca «Crea un look» per farne creare un altro nella sezione Stylist.",
        "Con 10 capi o più arrivano anche gli outfit per la settimana e i viaggi.",
      ],
    },
    "add-one": {
      title: "Aggiungere un capo",
      steps: [
        "Apri Guardaroba.",
        "Tocca il tasto + in alto.",
        "Scegli «Aggiungi un capo».",
        "Scatta una foto o scegline una dalla galleria.",
        `${BRAND_NAME} toglie lo sfondo e compila tipo, colori, materiali e stagione: controlla e correggi se serve.`,
        "Tocca «Salva nel guardaroba».",
      ],
      tip: "Prezzo e data d'acquisto sono facoltativi, ma servono per il costo per utilizzo nelle statistiche.",
    },
    "add-link": {
      title: "Aggiungere un capo da un link",
      intro: "Hai comprato online? Puoi usare la pagina del prodotto invece di una foto.",
      steps: [
        "Sul sito del negozio copia il link del capo (Condividi › Copia, o tieni premuta la barra degli indirizzi).",
        "In Guardaroba tocca +.",
        `Scegli «Incolla un link»: se il telefono lo chiede tocca Incolla. ${BRAND_NAME} prende subito foto, brand, prezzo e materiali dalla pagina.`,
        "Controlla i dati e tocca «Salva nel guardaroba».",
      ],
      tip: `Su Android, con l'app installata, puoi anche toccare Condividi sulla pagina del negozio e scegliere ${BRAND_NAME}. Per più link insieme usa «Scansione foto in lotto».`,
    },
    batch: {
      title: "Caricare più capi insieme",
      steps: [
        "In Guardaroba tocca +.",
        "Scegli «Scansione foto in lotto».",
        "Scegli fino a 50 foto dalla galleria, oppure incolla i link dei prodotti.",
        "Le foto vengono elaborate in background: puoi chiudere l'app e trovi un avviso nelle notifiche quando è pronto.",
        "Tocca «Rivedi», scegli i capi da tenere e aggiungili al guardaroba.",
      ],
      tip: `Se il servizio non è disponibile, ${BRAND_NAME} te lo dice sotto il lotto: riprova più tardi.`,
    },
    "outfit-scan": {
      title: "Fotografare un outfit intero",
      intro: `Una tua foto con l'outfit addosso: ${BRAND_NAME} riconosce tutti i capi insieme.`,
      steps: [
        "In Guardaroba tocca +.",
        "Scegli «Scansiona un outfit» e scatta o scegli una foto a figura intera.",
        "Controlla i capi riconosciuti: quelli già nel guardaroba vengono abbinati, i nuovi puoi aggiungerli.",
        "Se l'hai indossato oggi, tocca «Sì, segna come indossato».",
      ],
    },
    find: {
      title: "Trovare un capo",
      steps: [
        "Apri Guardaroba.",
        "Vedi tutti i capi che hai a disposizione: quelli nel cambio stagione, prestati o archiviati sono nelle loro sezioni, sotto i filtri.",
        "Usa la ricerca e le categorie in alto per restringere l'elenco.",
      ],
    },
    "item-card": {
      title: "La scheda di un capo",
      steps: [
        "In Guardaroba tocca un capo per aprirne la scheda.",
        "Da qui puoi modificare i dettagli, rimuovere lo sfondo o regolare il ritaglio della foto.",
        "«Crea outfit partendo da questo» ti propone look costruiti intorno a quel capo.",
        "Tocca «Opzioni» per metterlo nel cesto del bucato o in tintoria, spostarlo nel cambio stagione, prestarlo, venderlo o archiviarlo.",
      ],
    },
    locations: {
      title: "Più guardaroba (casa, mare, città…)",
      intro: `Se tieni i vestiti in posti diversi, ${BRAND_NAME} può proporti solo quello che hai a portata di mano.`,
      steps: [
        "Apri Tu.",
        "Tocca l'ingranaggio per aprire Impostazioni.",
        "Tocca «Luoghi del guardaroba» e crea i tuoi luoghi.",
      ],
    },
    storage: {
      title: "Cambio stagione",
      intro: "Sposta nel cambio stagione i capi fuori stagione (in garage, in cantina, nel sottovuoto): restano tuoi, ma non vengono proposti finché non li riprendi.",
      steps: [
        "Apri Guardaroba.",
        "Tocca «Seleziona» e scegli i capi da spostare.",
        "Tocca «Cambio stagione». Per un capo solo puoi anche aprire la sua scheda e toccare «Opzioni» › «Sposta nel cambio stagione».",
        "Li ritrovi tutti in «Cambio stagione», sotto i filtri, con la data in cui li hai spostati.",
        "Quando cambia la stagione apri «Cambio stagione», seleziona i capi e tocca «Riprendi dal cambio stagione».",
        "In «Cambio stagione» trovi anche i consigli: come preparare i capi, come piegarli (con i disegni) e quali contenitori usare.",
      ],
      tip: "Nei viaggi, se la destinazione ha un clima diverso, ti chiediamo se usare anche i capi del cambio stagione.",
    },
    sell: {
      title: "Vendere un capo",
      intro: "Prepara in un attimo l'annuncio da pubblicare sul sito di vendita che preferisci.",
      steps: [
        "Apri il capo, tocca «Opzioni» e poi «Vendi questo capo».",
        "Scegli le condizioni: il prezzo suggerito si adatta, in base al valore di rivendita stimato.",
        "Controlla titolo e descrizione, salva la foto (è già senza sfondo) e tocca «Copia annuncio»: incollalo sul sito di vendita che preferisci.",
        "Quando l'hai venduto tocca «Segna come venduto»: il capo va in Archiviati.",
      ],
      tip: "In Guardaroba ti proponiamo i capi che non metti da un'intera stagione (6 mesi per quelli di tutte le stagioni, 2 anni per quelli da cerimonia), se segni ciò che indossi. Con «Lo tengo» non te li riproponiamo per un anno.",
    },
    basket: {
      title: "Cesto del bucato, tintoria e prestiti",
      intro: "I capi da lavare, in tintoria o prestati non escono nei look finché non tornano nell'armadio.",
      steps: [
        "Apri il capo, tocca «Opzioni» e poi «Nel cesto del bucato». I capi sportivi ci vanno da soli quando segni il look come indossato.",
        "In Guardaroba tocca «Fuori dall'armadio» e poi «Cesto» (lì trovi anche «Tintoria» e «Prestati»): i capi sono divisi per lavatrice. Tocca «Lavati» quando hai finito; se te ne dimentichi, dopo 10 giorni tornano da soli nell'armadio.",
        "Per la tintoria: «Opzioni» › «In tintoria». Non tornano da soli: dopo 7 giorni ti chiediamo se li hai ritirati.",
        "Per i capi prestati, 14 giorni dopo ti chiediamo se li hai ripresi. Con «Ce l'ha ancora» te lo richiediamo dopo altri 14 giorni.",
      ],
    },
    laundry: {
      title: "Lavaggio",
      intro: "Come lavare ogni capo e cosa significano i simboli dell'etichetta.",
      steps: [
        "Apri Tu.",
        "Tocca l'ingranaggio per aprire Impostazioni.",
        "In Guardaroba tocca «Guida al lavaggio»: trovi i simboli dell'etichetta disegnati e spiegati, i programmi della lavatrice e qualche consiglio.",
        "Apri un capo e tocca «Come lavarlo»: trovi i materiali, il programma, l'asciugatura e lo stiro adatti a quel tessuto, con i simboli dell'etichetta.",
      ],
      tip: "Se l'etichetta del capo dice diversamente, vale sempre l'etichetta.",
    },
    today: {
      title: "Il look di oggi",
      steps: [
        "In Home trovi La selezione di oggi, scelta tra i tuoi capi.",
        "Tocca «Usa posizione» o scrivi la tua città: il look terrà conto del meteo.",
        "I look tengono conto anche dei tuoi impegni, se colleghi il calendario.",
      ],
    },
    canvas: {
      title: "Creare un outfit a mano",
      steps: [
        "Apri Stylist.",
        "Tocca «Crea manualmente»: si apre la tela.",
        "Tocca «Aggiungi dal guardaroba» e scegli i capi.",
        "Sposta, ingrandisci e sovrapponi i capi con le dita.",
        "Tocca «Salva outfit». Puoi anche condividerlo o metterlo nel calendario.",
      ],
    },
    "ask-stylist": {
      title: "Chiedere allo stylist",
      intro: "Scrivi o parla come faresti con una persona: «cosa metto per un matrimonio in giardino a giugno?».",
      steps: [
        "Apri Stylist.",
        "Tocca «Chiedi al tuo stylist».",
        "Scrivi la domanda, oppure tocca il microfono, parla e toccalo di nuovo per finire.",
        "Il look proposto usa i tuoi capi: puoi salvarlo nella tela o aggiungerlo al calendario.",
      ],
    },
    "ai-suggest": {
      title: "Un outfit per un'occasione",
      steps: [
        "Apri Stylist e scorri fino ad «Altre opzioni».",
        "Scegli l'occasione.",
        `Tocca «Suggerimento AI»: ${BRAND_NAME} compone un outfit dai tuoi capi.`,
      ],
    },
    "work-week": {
      title: "Gli outfit da lavoro della settimana",
      steps: [
        "Apri Stylist.",
        "Tocca «Crea outfit da lavoro».",
        "Scegli il periodo e il guardaroba da usare, poi tocca «Genera».",
        "I giorni lavorativi e il dress code si impostano in Impostazioni › Preferenze di stile.",
      ],
    },
    "my-outfits": {
      title: "I tuoi outfit",
      steps: [
        "Apri Stylist e scorri fino a I miei outfit.",
        "In arrivo: i look pianificati. Indossati: quelli che hai messo. My Outfit: le tue foto. Salvati e Archivio: i look che hai tenuto.",
        "Su ogni outfit puoi condividerlo, duplicarlo, archiviarlo o eliminarlo.",
      ],
    },
    worn: {
      title: "Segnare cosa hai indossato",
      intro: `Così ${BRAND_NAME} sa cosa usi davvero: migliora i suggerimenti e calcola il costo per utilizzo.`,
      steps: [
        `Quando ${BRAND_NAME} ti chiede «Hai indossato questo?», tocca «Sì, questo è quello che ho indossato».`,
        "Oppure in Calendario apri il giorno e tocca «Segna come indossato».",
        "Oppure fotografati con «Scansiona un outfit».",
      ],
    },
    "plan-day": {
      title: "Pianificare un giorno",
      steps: [
        "Apri Calendario.",
        "Tocca un giorno del mese.",
        "Pianifica un outfit, chiedi allo stylist o scegli tu i capi.",
        "A fine giornata puoi segnarlo come indossato.",
      ],
    },
    "connect-calendar": {
      title: "Collegare il tuo calendario",
      intro: `Con i tuoi impegni, ${BRAND_NAME} propone l'outfit giusto per ogni appuntamento.`,
      steps: [
        "Apri Tu.",
        "Tocca l'ingranaggio per aprire Impostazioni.",
        "Tocca «Calendario».",
        "Collega Google, Outlook o iCloud. Per iCloud serve una password specifica per app, creata su appleid.apple.com.",
      ],
      tip: `${BRAND_NAME} legge soltanto i tuoi impegni e non li modifica: li aggiorna da sola due volte al giorno, e puoi sincronizzarli quando vuoi. Le credenziali sono salvate cifrate.`,
    },
    trips: {
      title: "Preparare un viaggio",
      steps: [
        "Apri Calendario.",
        "Tocca «Viaggi» in alto.",
        "Tocca «Pianifica un viaggio».",
        "Scrivi la destinazione (puoi aggiungere tappe), le date, il tipo di viaggio e da quale guardaroba prendere i capi.",
        "Aggiungi le attività con l'orario di inizio e di fine, oppure sceglile dal calendario: gli orari arrivano da soli.",
        `${BRAND_NAME} prepara la valigia e gli outfit per le giornate, in base al meteo previsto: appuntamenti uno dopo l'altro, o una cena dentro un evento, tengono un solo look, e se fa freddo in valigia c'è un capospalla. Per fiere, esposizioni, congressi e incontri con clienti: completo, oppure pantaloni sartoriali o gonna con camicia, blusa o maglia, e sempre la giacca; in valigia c'è sempre anche un paio di scarpe senza tacco.`,
      ],
      tip: "La × nella Trip Capsule non svuota la valigia: esclude quel capo da questo viaggio e non verrà più proposto, nemmeno rigenerando. Per rimetterlo tocca «Aggiungi» e sceglilo. Per far ricominciare la scelta, cancella i look e premi «Genera outfit»: i capi che non hai tolto restano, quelli tolti no.",
    },
    "create-avatar": {
      title: "Creare il tuo avatar",
      intro: "L'avatar è la tua foto a figura intera: serve per vedere gli outfit indossati da te.",
      steps: [
        "Apri Tu.",
        "Tocca «Il mio avatar».",
        "Tocca «Aggiungi la tua foto»: in piedi, di fronte, figura intera, buona luce.",
        "Leggi e accetta l'uso della foto. Puoi poi ingrandirla e centrarla, cambiarla o eliminarla quando vuoi.",
      ],
    },
    "try-on": {
      title: "Provare un outfit sull'avatar",
      steps: [
        "Su un outfit tocca «Prova sul mio avatar», oppure scegli i capi tu.",
        "Tocca «Genera» e attendi qualche secondo.",
        "Salva il risultato tra i tuoi outfit o rigeneralo.",
        "Le prove disponibili dipendono dal tuo piano: le vedi in Impostazioni › Piano e utilizzo.",
      ],
    },
    "color-analysis": {
      title: "Analisi del colore",
      steps: [
        "Apri Tu.",
        "Tocca «Analisi colore».",
        "Fai una foto del viso alla luce naturale. La foto viene analizzata sul telefono e non viene salvata.",
        `Tocca «Salva sul profilo»: ${BRAND_NAME} userà la tua palette negli abbinamenti.`,
      ],
    },
    "color-lab": {
      title: "Armonia dei colori",
      steps: [
        "Apri Home.",
        "Tocca Color Lab.",
        "Scegli un capo e scopri con quali colori del tuo guardaroba si abbina.",
      ],
    },
    shop: {
      title: "Cosa comprare (e cosa no)",
      steps: [
        "Apri Home.",
        `Tocca «Completa il guardaroba»: ${BRAND_NAME} ti dice quali capi ti mancano davvero e con quanti dei tuoi si abbinerebbero.`,
        `Stai per comprare qualcosa? Tocca «Devo comprarlo?» e incolla il link o carica una foto: ${BRAND_NAME} lo confronta con quello che hai già.`,
      ],
    },
    wishlist: {
      title: "Wishlist e risparmi",
      intro: "Metti in fila i capi che vorresti e tieni il conto di quanto metti da parte per comprarli.",
      steps: [
        "Apri Home e tocca «Completa il guardaroba».",
        "Controlla un capo con «Devo comprarlo?» (link, foto o etichetta) e tocca «Aggiungi alla wishlist». La trovi più in basso nella stessa pagina, con quanti tuoi capi ci si abbinano, se hai già qualcosa di simile e quanto ti costerebbe a utilizzo.",
        "Ordina i capi con le frecce, per priorità. Per ciascuno scegli «Entro una data» (ti diciamo quanto mettere da parte al mese) oppure «Al mese» (indichi quanto metti da parte e ti diciamo quando ci arrivi).",
        "Ogni mese ti chiediamo se hai messo da parte la cifra. Con «Aggiungi» puoi annotare anche altre cifre messe da parte.",
        "Quando lo compri tocca «Comprato»: il prezzo esce dai risparmi e lo aggiungi all'armadio.",
      ],
      tip: "Nimbèa non muove soldi veri: è solo un promemoria di quanto hai messo da parte.",
    },
    insights: {
      title: "Statistiche del guardaroba",
      steps: [
        "Apri Tu.",
        "Tocca «Statistiche guardaroba».",
        "Vedi valore del guardaroba, costo per utilizzo e capi mai indossati. Puoi arrivarci anche dal tasso di utilizzo in Home.",
      ],
    },
    friends: {
      title: "Amici e condivisione",
      steps: [
        "Apri Tu.",
        "Tocca «Community» e scegli il tuo username.",
        "Mostra il tuo codice QR per farti aggiungere dagli amici.",
        "Condividi un outfit con il tasto di condivisione: puoi mandarlo in chat o pubblicarlo nel Feed.",
        `Con «Invita amici» mandi il link per scaricare ${BRAND_NAME}.`,
      ],
    },
    "profile-settings": {
      title: "Profilo, taglie e preferenze",
      intro: `Più ${BRAND_NAME} sa di te, più i suggerimenti sono giusti.`,
      steps: [
        "Da Tu, tocca l'ingranaggio per aprire Impostazioni.",
        "Dati personali: nome, data di nascita, lavoro.",
        "Le mie taglie: le tue taglie per abbigliamento e scarpe.",
        "Preferenze di stile: dress code al lavoro, formalità e giorni lavorativi.",
        "Preferenze di abbigliamento: cosa preferisci evitare (spalle scoperte, gonne corte, tacchi alti…).",
        "Lingua: italiano, inglese, spagnolo, francese o cinese semplificato.",
      ],
    },
    "notifications-privacy": {
      title: "Notifiche e privacy",
      steps: [
        "Notifiche: scegli quali avvisi ricevere, per esempio quando il meteo cambia per un outfit pianificato.",
        "Privacy: la condivisione anonima dei tuoi capi nella libreria comune e «Le tue scelte sui dati» (novità e offerte via email, offerte dei partner, statistiche anonime).",
      ],
    },
    plan: {
      title: "Piano e utilizzo",
      steps: [
        "In Impostazioni tocca «Piano e utilizzo».",
        "Vedi il tuo piano e quanto hai usato oggi e questo mese delle funzioni con un limite.",
      ],
    },
    problem: {
      title: "Segnalare un problema",
      steps: [
        "In Impostazioni tocca «Segnala un problema».",
        "Scrivi cosa è successo e dove: lo leggiamo e lo sistemiamo.",
      ],
    },
    "delete-account": {
      title: "Cancellare l'account",
      steps: [
        "In fondo a Impostazioni tocca «Cancella account».",
        "Conferma: vengono eliminati per sempre l'account, i capi, gli outfit, le foto e l'avatar.",
      ],
    },
  },
};

export default text;
