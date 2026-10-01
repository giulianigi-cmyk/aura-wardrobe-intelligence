# AURA — "Scansiona un outfit": riconoscimento e matching con il guardaroba

Data: 2026-10-01 · Branch `claude/aura-audit-commercial-structure-dgc74y` (ripartito da `main` c5660cc)

## 1. Problema individuato

Flusso prima della modifica (`OutfitScan.tsx`):

1. Gemini 2.5 Flash (`detectOutfitItems`) rileva i capi con categoria, sottocategoria, 1-2 colori della palette
   e una descrizione di 3-6 parole. **Nessun campo per pattern/fantasia, tonalità o dettagli.**
2. `findBestMatch` / `findTopMatches` (`outfit-dedupe.ts`) confrontano solo i **metadati**: categoria (+0.25),
   colore come **uguaglianza esatta del nome** (+0.25), sottocategoria (+0.25), brand (+0.25). OutfitScan passava
   sempre il brand vuoto, quindi il massimo era **75%** e mai "certo".
3. Embedding DINOv2 nel browser + pgvector: usato solo se la similarità superava il 75% attributi, cosa che con una
   foto indossata confrontata con un ritaglio prodotto non succede quasi mai. Solo 223 capi su 457 hanno l'embedding.
4. Al modello AI **non arrivava mai nessuna immagine del guardaroba**: il matching era al 100% su metadati.

Conseguenze, verificate sui dati reali dell'account owner (sola lettura): 10 pantaloni "Jet Black", 6 blazer neri,
7 gonne nere. Tutti i capi con stessa categoria + sottocategoria + nome colore ottenevano **lo stesso 75%** e vinceva il
primo dell'elenco: scelta arbitraria. Un navy fotografato con luce scura ed etichettato "Jet Black" non poteva mai
trovare il pantalone navy. Il gessato e la tinta unita erano indistinguibili. La percentuale mostrata era decorativa.

## 2. File modificati

| File | Modifica |
|---|---|
| `src/lib/outfit-match.ts` (nuovo) | Livello 1 (retrieval) + combinazione del verdetto visivo, calibrazione, confidenza |
| `src/lib/outfit-scan-match.functions.ts` (nuovo) | Livello 2: funzione server di reranking visivo |
| `src/lib/outfit-match.test.ts` (nuovo) | 20 test |
| `src/lib/outfit-detect.server.ts` | Modalità `detailed` opzionale (solo per Scansiona un outfit) |
| `src/lib/outfit-detect-types.ts` | Campi opzionali `pattern`, `colorShade`, `visualDescription`, `details` |
| `src/lib/outfit-scan-detect.functions.ts` | Chiama il detector in modalità `detailed` |
| `src/components/aura/screens/OutfitScan.tsx` | Usa i due livelli; alternative con %, motivazione, "nessun match sicuro" |
| `src/i18n/locales/{en,it,es,fr}.json` | 4 stringhe nuove |

**Non modificati:** `outfit-dedupe.ts` (BatchReview, LogWear, purchase advisor continuano a usarlo identico), il prompt
di default del detector (verificato byte per byte: identico per scansione batch e LogWear), salvataggio capi,
My Outfit, calendario, ricerca manuale, ricostruzione, schema DB, Storage, monetizzazione, limiti, privacy/termini.

## 3. Logica di matching

**Prima:** punteggio additivo sui metadati, colore per nome esatto, nessuna immagine del guardaroba.

**Dopo — Step A (analisi visiva):** in modalità `detailed` il detector restituisce in più `pattern` (solid,
pinstripe, stripes, check, houndstooth, floral, animal, polka dot, geometric, print, textured, other), `colorShade`
("dark navy"), `visualDescription` (12-30 parole: tonalità, pattern, materiale apparente, silhouette, fit, lunghezza,
costruzione) e `details` (dettagli distintivi). Istruzioni esplicite: correggere la luce, non confondere
navy/nero, avorio/bianco, cammello/beige ecc., **non inventare** ciò che non è visibile.

**Livello 1 — retrieval (sul telefono, nessuna chiamata):** per ogni capo del guardaroba della stessa categoria
(blazer/cardigan accettati tra Tops e Outerwear) calcola un punteggio pesato sui soli dati noti da entrambi i lati:
- colore 50% — distanza percettiva **CIEDE2000** tra i colori della palette (nero/soft black 0,92; bianco/avorio
  0,83; nero/navy 0,28; beige/cammello 0,25; grigio chiaro/scuro 0,00);
- sottocategoria 20%, pattern 15% (dai tag Striped/Checkered/Floral/Animal Print), forma 10% (fit, lunghezza,
  maniche), materiale 5%.

Tiene i migliori 6; i vicini visivi dell'embedding DINOv2, quando esistono, entrano comunque nel gruppo. Un capo nero
in foto con luce scura tiene quindi il pantalone navy tra i candidati.

**Livello 2 — reranking visivo (una chiamata per capo, in parallelo, max 3 insieme):** Gemini 2.5 Flash riceve il
ritaglio del capo dalla foto (~640 px) e le **miniature reali** dei candidati (400 px, scaricate dal server con la
sessione dell'utente) e assegna 0-100 a colore, pattern, silhouette, materiale, dettagli, un giudizio complessivo
calibrato, "stesso capo: sì/forse/no" e una motivazione breve nella lingua dell'app. Il prompt dice esplicitamente
che è normale che nessun candidato sia quello giusto.

## 4. Confidence score

`score = 0,55·overall + 0,13·colore + 0,12·pattern + 0,10·silhouette + 0,04·materiale + 0,06·dettagli` (0-1), poi:

- colore o pattern < 35 → massimo 55% (stessa categoria + stesso colore non bastano mai se il pattern è diverso, e viceversa);
- silhouette < 30 → massimo 60%;
- "non è lo stesso capo" → massimo 50%; "forse" → massimo 88%.

La percentuale mostrata **è questo score**. Due candidati simili restano vicini (es. 84% / 81%), non vengono separati
artificialmente.

| Livello | Regola | Comportamento |
|---|---|---|
| HIGH | ≥ 85%, "stesso capo: sì", vantaggio ≥ 8 punti sul secondo | proposto direttamente ("Già nel tuo guardaroba · 90%") |
| MEDIUM | ≥ 65% | card "È lo stesso capo?" con il candidato principale + fino a 4 alternative con foto, %, nome e motivazione |
| LOW | < 65% | nessun match forzato: "Nessun match sicuro nel guardaroba — scegli tu il capo o aggiungilo come nuovo" + alternative deboli (≥ 40%) |

## 5. Fallback

- **Match sicuro:** HIGH, già confermato; restano "Non è questo? Cerca" e "Aggiungi comunque".
- **Più candidati:** MEDIUM; si tocca un'alternativa per selezionarla, poi "Sì, uguale" / "No, diverso" / "Cerca nel guardaroba".
- **Nessun match:** LOW; il capo resta come nuovo con le alternative deboli toccabili, "È già nel guardaroba? Cercalo",
  "Adatta ritaglio" e "Ricostruisci" invariati.
- **Capo non nel guardaroba** (nessun candidato della categoria): nessuna chiamata AI di confronto, LOW, flusso di
  creazione/ricostruzione invariato.
- **Confronto visivo non disponibile** (errore AI/rete): ranking dai soli metadati **scalato** in 0-74%: mai HIGH,
  MEDIUM solo con metadati completamente concordi; messaggio "Confronto visivo non disponibile: verifica tu il capo".

## 6. Test effettuati

| Test | Risultato |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ 0 errori |
| Test suite (`bun test src/lib`) | ✅ 152/152 (132 precedenti + 20 nuovi) |
| Build di produzione | ✅ (solo i warning preesistenti) |
| Lint sui file nuovi | ✅ 0 (3 `any` preesistenti nei file toccati, non introdotti) |
| Prompt di default del detector | ✅ identico byte per byte (scansione batch e LogWear invariati) |
| Bundle client | ✅ prompt e chiave solo nel bundle server; chunk OutfitScan 26 → 35,6 KB |

Test automatici (logica, con risposte del modello simulate): nero vs navy (anche navy fotografato "nero"), bianco vs
avorio, beige vs cammello, grigio chiaro vs scuro; tinta unita vs gessato (esempio del brief: gessato navy > navy
tinta unita > gessato nero), righe, quadri, floreale, animalier; slim vs wide e le altre silhouette tramite il tetto
di silhouette; denim/cotone, pelle/tessuto, velluto/lana, satin/opaco; capi quasi identici (MEDIUM, % vicine);
10 pantaloni neri identici nei metadati (ordine stabile, mai certo senza verifica visiva); capo assente (blazer beige
vs nero/blu/grigio → nessun match, anche senza AI); sosia dello stesso colore con verdetto "no"; luce calda;
AI non disponibile; candidato non valutato; massimo 4 alternative; categoria; vicini da embedding; mappatura
robusta della risposta del modello; bande delle percentuali.

Test end-to-end dell'interfaccia (build di produzione, iPhone emulato, backend e AI simulati, nessun dato reale):
outfit blazer beige + top bianco + pantalone navy gessato + sneakers bianche + borsa rossa + cintura cognac su un
guardaroba con le varianti del brief → blazer beige oversize HIGH 89%, top bianco MEDIUM 84% con avorio 81% come
alternativa, pantalone navy gessato HIGH 90%, sneakers (confronto AI simulato in errore) MEDIUM 71% con beige 52%,
borsa e cintura "Nessun match sicuro". 5 richieste di confronto in parallelo, nessuna per la borsa (nessuna borsa nel
guardaroba). Flusso completo in italiano: alternative, ricerca manuale, salvataggio in My Outfit (1 foto + 1 evento
indossato), "Fatto", ritorno al guardaroba, 0 errori. Con il confronto AI completamente giù nessun capo viene confermato
in automatico.

**Non testato qui:** le chiamate reali a Gemini su foto reali (in questo ambiente non c'è la chiave AI). I casi
"foto difficile" (poca luce, luce calda, specchio, capi sovrapposti, più persone) dipendono dal modello e vanno
verificati sull'app pubblicata con il tuo guardaroba.

## 7. Regressioni

Nessuna funzionalità rimossa: scansione, selezione manuale, alternative (prima frecce ‹ ›, ora anche miniature),
scelta del capo, "Aggiungi comunque", creazione/ricostruzione, salvataggio capi ed embedding, My Outfit, calendario,
modifica outfit, dati del guardaroba. Le funzioni `findBestMatch` / `findTopMatches` / `findVisualDuplicates`
restano e sono usate come prima dagli altri flussi.

## 8. Limiti

- Dalla sola foto non si distinguono in modo affidabile: materiale esatto (lana vs misto, cashmere vs lana), capi
  identici dello stesso modello (due copie dello stesso pantalone), differenze di colore minime sotto luce artificiale
  forte, dettagli nascosti (tasche posteriori, interno, etichette), brand senza logo visibile.
- La qualità del livello 2 dipende dalle foto nel guardaroba: un capo con foto scura o mal ritagliata viene giudicato peggio.
- Costo/tempo: una chiamata AI in più per capo rilevato con candidati (in parallelo, ~6 miniature da 400 px). Nessun
  limite server-side sulle chiamate AI (problema già segnalato, non toccato: riguarda la monetizzazione).
