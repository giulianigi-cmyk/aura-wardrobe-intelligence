import type { GuideText } from "./guide-structure";

const text: GuideText = {
  title: "Guida di AURA",
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
      title: "Com'è fatta AURA",
      intro: "AURA è il tuo guardaroba digitale: fotografi i tuoi capi e l'app ti propone cosa indossare, ogni giorno. In basso ci sono sempre cinque sezioni.",
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
        "AURA scontorna e riconosce i capi in background: puoi intanto usare l'app o chiuderla.",
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
        "AURA toglie lo sfondo e compila tipo, colori, materiali e stagione: controlla e correggi se serve.",
        "Tocca «Salva nel guardaroba».",
      ],
      tip: "Prezzo e data d'acquisto sono facoltativi, ma servono per il costo per utilizzo nelle statistiche.",
    },
    "add-link": {
      title: "Aggiungere un capo da un link",
      intro: "Hai comprato online? Puoi usare la pagina del prodotto invece di una foto.",
      steps: [
        "In Guardaroba tocca + e poi «Aggiungi un capo».",
        "Tocca «Incolla link prodotto».",
        "Incolla il link nel campo (tieni premuto e scegli Incolla) oppure tocca «Incolla dagli appunti».",
        "Tocca «Importa prodotto»: AURA prende foto, brand e prezzo dalla pagina. Controlla e salva.",
      ],
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
      tip: "Se il servizio non è disponibile, AURA te lo dice sotto il lotto: riprova più tardi.",
    },
    "outfit-scan": {
      title: "Fotografare un outfit intero",
      intro: "Una tua foto con l'outfit addosso: AURA riconosce tutti i capi insieme.",
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
        "Scegli se vedere solo i capi di questa stagione o tutte le stagioni.",
        "Usa la ricerca e le categorie in alto per restringere l'elenco.",
      ],
    },
    "item-card": {
      title: "La scheda di un capo",
      steps: [
        "In Guardaroba tocca un capo per aprirne la scheda.",
        "Da qui puoi modificare i dettagli, rimuovere lo sfondo o regolare il ritaglio della foto.",
        "«Crea outfit partendo da questo» ti propone look costruiti intorno a quel capo.",
        "Puoi segnarlo come prestato, archiviarlo se non lo usi più o eliminarlo.",
      ],
    },
    locations: {
      title: "Più guardaroba (casa, mare, città…)",
      intro: "Se tieni i vestiti in posti diversi, AURA può proporti solo quello che hai a portata di mano.",
      steps: [
        "Apri Tu.",
        "Tocca l'ingranaggio per aprire Impostazioni.",
        "Tocca «Luoghi del guardaroba» e crea i tuoi luoghi.",
      ],
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
        "Tocca «Suggerimento AI»: AURA compone un outfit dai tuoi capi.",
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
      intro: "Così AURA sa cosa usi davvero: migliora i suggerimenti e calcola il costo per utilizzo.",
      steps: [
        "Quando AURA ti chiede «Hai indossato questo?», tocca «Sì, questo è quello che ho indossato».",
        "Oppure in Calendario apri il giorno e tocca «Segna come indossato».",
        "Oppure fotografati con «Scansiona un outfit».",
      ],
    },
    "plan-day": {
      title: "Pianificare un giorno",
      steps: [
        "Apri Calendario.",
        "Tocca un giorno della settimana o del mese.",
        "Pianifica un outfit, chiedi allo stylist o scegli tu i capi.",
        "A fine giornata puoi segnarlo come indossato.",
      ],
    },
    "connect-calendar": {
      title: "Collegare il tuo calendario",
      intro: "Con i tuoi impegni, AURA propone l'outfit giusto per ogni appuntamento.",
      steps: [
        "Apri Tu.",
        "Tocca l'ingranaggio per aprire Impostazioni.",
        "Tocca «Calendario».",
        "Collega Google, Outlook o iCloud. Per iCloud serve una password specifica per app, creata su appleid.apple.com.",
      ],
      tip: "AURA legge soltanto i tuoi impegni e non li modifica. Le credenziali sono salvate cifrate.",
    },
    trips: {
      title: "Preparare un viaggio",
      steps: [
        "Apri Calendario.",
        "Tocca la valigia in alto.",
        "Tocca «Pianifica un viaggio».",
        "Scrivi la destinazione (puoi aggiungere tappe), le date, il tipo di viaggio e da quale guardaroba prendere i capi.",
        "AURA prepara la lista per la valigia e gli outfit per le giornate, in base al meteo previsto.",
      ],
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
        "Tocca «Salva sul profilo»: AURA userà la tua palette negli abbinamenti.",
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
        "Tocca «Completa il guardaroba»: AURA ti dice quali capi ti mancano davvero e con quanti dei tuoi si abbinerebbero.",
        "Stai per comprare qualcosa? Tocca «Devo comprarlo?» e incolla il link o carica una foto: AURA lo confronta con quello che hai già.",
      ],
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
        "Con «Invita amici» mandi il link per scaricare AURA.",
      ],
    },
    "profile-settings": {
      title: "Profilo, taglie e preferenze",
      intro: "Più AURA sa di te, più i suggerimenti sono giusti.",
      steps: [
        "Da Tu, tocca l'ingranaggio per aprire Impostazioni.",
        "Dati personali: nome, data di nascita, lavoro.",
        "Le mie taglie: le tue taglie per abbigliamento e scarpe.",
        "Preferenze di stile: dress code al lavoro, formalità e giorni lavorativi.",
        "Preferenze di abbigliamento: cosa preferisci evitare (spalle scoperte, gonne corte, tacchi alti…).",
        "Lingua: italiano, inglese, spagnolo o francese.",
      ],
    },
    "notifications-privacy": {
      title: "Notifiche e privacy",
      steps: [
        "Notifiche: scegli quali avvisi ricevere, per esempio quando il meteo cambia per un outfit pianificato.",
        "Privacy: decidi se condividere i tuoi capi nella libreria comune, in forma anonima.",
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
