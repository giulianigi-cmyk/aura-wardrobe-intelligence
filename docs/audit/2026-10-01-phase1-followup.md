# AURA — Fase 1, approfondimento dei 3 punti aperti

Data: 2026-10-01 · **Solo analisi.** Nessuna modifica a codice, database o Storage. Sul DB di produzione solo query
`SELECT`. Le build sono state fatte in una copia separata in `/tmp`, fuori dal progetto.

---

## 1. THUMBNAIL — DRY RUN

### Stato reale (DB di produzione, sola lettura)

| Dato | Valore |
|---|---|
| Garment senza thumbnail | **257** (`wardrobe_items.thumbnail_path IS NULL`) |
| Utenti coinvolti | 4 (228, 26, 2 e 1 capi) |
| Archiviati tra questi | 1 |
| `image_url` nullo | 0 |
| `image_url` in formato legacy (URL http completo) | 0: sono tutti path di Storage |
| Originale presente in Storage (`bucket wardrobe`) | **257 su 257** |
| Originale mancante | 0 |
| Formato degli originali | `image/png` (tutti) |
| Peso totale degli originali | 154,7 MB |
| Media / massimo | 616 KB / **19.183.901 B (18,3 MiB)** |
| Distribuzione | 212 sotto 1 MB · 44 tra 1 e 5 MB · 1 sopra 5 MB |
| Stesso originale condiviso da più capi | 0 |
| Thumbnail referenziate ma mancanti in Storage | 0 |
| File `thumb-*` in Storage **non** referenziati da nessun capo | **102**: orfani preesistenti (vedi nota) |
| Periodo di creazione | 15 luglio → 27 settembre; 255 prima del 10 agosto, 2 dopo (thumbnail fallita all'upload) |

Nota sui 102 file orfani: sono thumbnail caricate in passato e non (più) collegate a un capo, per esempio dopo eliminazioni,
sostituzioni dell'immagine o un aggiornamento del DB fallito. **Non vanno riutilizzate**: non c'è modo affidabile di
associarle a un capo. Il backfill non le tocca.

### Come vengono identificati i capi

```sql
select id, user_id, image_url from wardrobe_items
where thumbnail_path is null and image_url is not null
order by created_at;
```

Nel backfill eseguito dal browser dell'utente la stessa query passa dalle regole di accesso (RLS), quindi ognuno vede solo i propri capi.

### Processo proposto (lo stesso della pipeline attuale, già in produzione dal 10 agosto)

1. Si firma l'URL dell'originale (`createSignedUrls`, a batch) e lo si **scarica** (sola lettura).
2. Si genera la thumbnail con **`compressImageForUpload(file, 400, 0.75)`** (`src/lib/image-compress.ts`), la stessa
   funzione usata oggi da `AddItem.tsx:811`, `Wardrobe.tsx:376/424` e `BatchReview.tsx:448`:
   - lato più lungo **400 px** (mai ingrandita);
   - **JPEG qualità 0,75**, sfondo **bianco** (le trasparenze del PNG diventano bianche, come per le thumbnail attuali);
   - dimensione attesa **~17 KB** (media delle 292 thumbnail esistenti; massimo osservato 63 KB).
3. Si carica la thumbnail nel bucket `wardrobe` a un **percorso deterministico**: `{user_id}/thumb-backfill-{item_id}.jpg`.
   - Il percorso attuale usa `Date.now()` più un suffisso casuale. Per il backfill propongo invece un nome fisso per capo, così una ripresa non può creare duplicati.
4. Si aggiorna il DB **solo se ancora vuoto**:
   ```sql
   update wardrobe_items set thumbnail_path = '{path}'
   where id = '{item_id}' and user_id = '{user_id}' and thumbnail_path is null;
   ```

### Operazioni stimate

| Operazione | Numero | Note |
|---|---:|---|
| Query di selezione | 1 per batch (~22 con batch da 12) | lettura |
| Firme URL originali | 1 richiesta per batch | lettura |
| Download originali | 257 | **154,7 MB** in totale (≈ 140 MB per l'account con 228 capi) |
| Upload thumbnail (Storage) | 257 | ≈ 4,4 MB in totale |
| Update DB (`wardrobe_items.thumbnail_path`) | 257 | solo righe con `thumbnail_path is null` |
| Cancellazioni | **0** | nessun file e nessuna riga eliminati |

### Sicurezza dell'operazione

| Domanda | Risposta |
|---|---|
| Idempotente? | **Sì**, con le due scelte sopra: percorso deterministico per capo + update solo se `thumbnail_path is null`. Rieseguirlo non produce effetti su capi già sistemati. |
| Interrotto a metà? | Ogni capo è indipendente. Se si interrompe dopo l'upload e prima dell'update, il file `thumb-backfill-{id}.jpg` esiste ma il capo resta senza thumbnail: alla ripresa viene **riscritto lo stesso file** (stesso nome, `upsert` solo su quel percorso) e poi aggiornato il DB. Nessun file duplicato. |
| A batch? | Sì (proposta: 12 capi per giro, come il backfill degli outfit). |
| Ripresa senza duplicare file? | Sì, grazie al nome deterministico. Il backfill attuale degli outfit (`outfit-thumb.ts:102`) usa invece nomi casuali e, se interrotto tra upload e update, lascia un orfano: per i garment non va copiato così com'è. |
| Rischio di sovrascrivere thumbnail esistenti? | **No.** L'update ha `thumbnail_path is null`, e il file scritto ha un nome diverso da tutte le thumbnail attuali (`thumb-<timestamp>-<random>.jpg`). Se l'utente nel frattempo cambia la foto e genera una sua thumbnail, il backfill non la tocca. |
| Originali preservati? | **Sì, assolutamente.** Vengono solo scaricati; nessuna operazione di scrittura, `update` o `remove` su `image_url` o sul file originale. |
| Permessi | Il backfill nel browser dell'utente usa la sua sessione: le policy Storage (`{uid}/…`) e le RLS impediscono di toccare dati di altri. |

### Dove eseguirlo: opzioni

| Opzione | Pro | Contro |
|---|---|---|
| **A. Nel browser dell'utente, in background** (come `backfillOutfitThumbs` in `AuraApp.tsx`) — consigliata | stesso algoritmo delle thumbnail attuali; nessun segreto; RLS garantita; nessuna nuova dipendenza | parte solo quando ogni utente apre l'app; 228 capi = ~19 giri da 12 (o un ciclo finché finisce); scarica ~140 MB sul dispositivo del tuo account (meglio su Wi-Fi/desktop); il PNG da 18,3 MiB su iPhone è pesante da decodificare (proposta: saltare i file > 8 MB su mobile e farli da desktop) |
| B. Script una tantum lanciato da te in locale con service role + `sharp` | tutti i 257 in un colpo, veloce | serve la `SUPABASE_SERVICE_ROLE_KEY` (non disponibile qui e da non condividere); qualità JPEG leggermente diversa dal canvas del browser |
| C. Trasformazione immagini di Supabase (`createSignedUrl(..., { transform: { width: 400 } })`) | **zero scritture**, nessun backfill | da verificare se il progetto Lovable Cloud ha le Image Transformations attive; cambia il modo in cui la griglia chiede le immagini |

**Nessuna operazione eseguita.** Per procedere serve la tua autorizzazione esplicita sull'opzione (A, B o C).

---

## 2. REACT #418 — CAUSA E SOLUZIONE PROPOSTA

### Riproduzione con React in modalità sviluppo (messaggio completo)

Server di sviluppo locale, `localStorage["aura.language"] = "it"`, Chromium:

```
Hydration failed because the server rendered text didn't match the client.
  <Splash> → <section className="absolute bottom-24 …" style={{animationDelay:"0.1s"}}
+   aria-label="Introduzione ad AURA"          ← client
-   aria-label="AURA introduction"             ← server
      data-tsd-source="/src/components/aura/screens/Splash.tsx:23:7"
    <p … data-tsd-source="/src/components/aura/screens/Splash.tsx:28:9">
+     "AURA è la tua app di intelligenza per il guardaroba di lusso. …"
-     "AURA is your luxury wardrobe intelligence app. …"
```

Con lingua inglese (nessuna lingua salvata): **0 errori**.

### Risposte

| # | Domanda | Risposta |
|---|---|---|
| 1 | Componente | **`Splash`** (`src/components/aura/screens/Splash.tsx`): è l'unica schermata renderizzata dal server, perché `AuraApp` parte sempre da `screen = "splash"`. Primo nodo diverso: `<section>` riga 23. |
| 2 | Valori diversi | Tutte le stringhe tradotte dello splash: `aria-label` (`splash.introAria`), descrizione (`splash.description`), e a seguire tagline, "Get started", "Sign in", "Est." (React segnala il primo nodo divergente e poi scarta l'intero albero). |
| 3 | Lingua lato server | `src/i18n/config.ts`, `initialLanguage()`: `if (typeof window === "undefined") return "en";`. Il server non legge né cookie né header. |
| 4 | Lingua lato client | Stessa funzione, ramo browser: `localStorage.getItem("aura.language")`, scritta solo da `LanguagePicker.tsx:22`, cioè il selettore lingua alla registrazione. Dopo il login `Home.tsx` sincronizza anche con `profile.language`, ma succede **dopo** l'idratazione e non causa mismatch. |
| 5 | Perché il server parte dall'inglese | Il server non ha accesso al `localStorage` del browser e l'istanza i18n è **un singleton condiviso tra tutte le richieste** sul server, quindi non può cambiare lingua per singola richiesta senza rischiare di mescolare utenti. |
| 6 | Dipende da | **localStorage + inizializzazione i18n a livello di modulo.** Nessun cookie è coinvolto (l'unico cookie del progetto è quello del componente `sidebar` inutilizzato). Riguarda solo chi ha scelto la lingua nel selettore iniziale. Chi l'ha cambiata da Impostazioni non ha `aura.language` salvato e quindi non vede l'errore. |
| 7 | Stessa lingua possibile? | Sì: o il client parte **anch'esso in inglese** e cambia lingua subito dopo l'idratazione (A), o il server conosce la lingua dell'utente tramite un **cookie** (B). |
| 8 | Più sicura e meno invasiva | **A.** |

Effetto attuale del problema: React scarta l'HTML del server e **ri-renderizza da zero l'intero albero** sul client, un lavoro in
più a ogni avvio per gli utenti non inglesi. È innocuo per i dati, ma costa tempo.

### Soluzione A (consigliata): applicare la lingua salvata dopo l'idratazione

| | |
|---|---|
| File | `src/i18n/config.ts` (inizializzazione sempre in `"en"`, uguale al server, ma con **pre-caricamento** del chunk della lingua salvata); `src/components/aura/AuraApp.tsx` (un `useEffect` al mount che chiama `i18n.changeLanguage(lingua salvata)`) |
| Prima | Il client idrata direttamente nella lingua salvata → mismatch → errore #418 → React ricostruisce tutto l'albero. |
| Dopo | Il client idrata in inglese (identico al server, nessun errore), poi nello stesso istante passa alla lingua salvata con un normale re-render. |
| Effetti collaterali | Lo splash può mostrare l'inglese per un istante prima della lingua dell'utente. Oggi lo splash dura solo il tempo di caricamento ed è comunque ricostruito da React all'idratazione, quindi la differenza visiva è minima. Va verificato che `LanguagePicker`, `SettingsLanguage` e la sincronizzazione di Home continuino a funzionare (test già fatti in Fase 1 riutilizzabili). |
| SEO | Invariato: i crawler ricevono già oggi l'HTML inglese dal server. |
| Performance | **Migliora**: niente più ricostruzione completa dell'albero per chi usa it/es/fr. |
| Splash / routing | Nessun impatto: la logica di uscita dallo splash non dipende dalla lingua. |

### Soluzione B (non consigliata ora): lingua in un cookie letta dal server

Il server leggerebbe un cookie `aura_lang` nella richiesta e renderizzerebbe direttamente nella lingua giusta, aggiornando anche `<html lang>`.
- **Pro:** nessun cambio lingua visibile.
- **Contro:** richiede un'istanza i18n **per richiesta** sul server (oggi è un singleton: senza questo cambio due richieste simultanee in lingue diverse si mescolerebbero), la lettura degli header in SSR e la scrittura del cookie nei due selettori di lingua. È più invasiva e tocca il rendering server.

**Nessuna correzione applicata.**

---

## 3. ONNX / CLOUDFLARE — VERIFICA EFFETTIVA

### Metodo

1. `bun.lock` del progetto letto direttamente. Le dipendenze puntano al registry privato di Lovable (`europe-west*-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`), non raggiungibile da qui.
2. Confronto degli **hash di integrità sha512** del lockfile con quelli del registry npm pubblico per `onnxruntime-web@1.26.0-dev.20260416-b7804b056c`, `onnxruntime-web@1.21.0`, `@huggingface/transformers@4.2.0`, `@imgly/background-removal@1.7.0`: **identici**, quindi i pacchetti sono byte per byte gli stessi.
3. Copia del commit `89af6af` (`main`, che è anche `latest_commit_sha` del progetto Lovable secondo il connettore) in `/tmp`, sostituzione dei soli URL del registry in quella copia, `bun install --frozen-lockfile` (bun verifica gli hash), build di produzione pulita. **Il progetto non è stato toccato.**

### Dipendenze ONNX nel lockfile

| Pacchetto | Versione nel lockfile | Chi lo richiede |
|---|---|---|
| `onnxruntime-web` | **1.26.0-dev.20260416-b7804b056c** | `@huggingface/transformers@4.2.0` (dipendenza diretta, versione esatta) |
| `onnxruntime-web` (annidato) | **1.21.0** | `@imgly/background-removal@1.7.0` (peer, versione esatta) |
| `onnxruntime-node` | 1.24.3 | `@huggingface/transformers` (solo Node, non finisce negli asset del browser) |

### Differenza rispetto all'audit precedente

Nella Fase 1 l'installazione dal registry pubblico **senza lockfile** aveva risolto per transformers `onnxruntime-web@1.31.0-dev.20260914`, una versione più recente che il progetto non usa. Il file da **25,6 MiB** (`ort-wasm-simd-threaded.asyncify.wasm`, 26.861.777 B) apparteneva a quella versione. Con il lockfile reale lo stesso file pesa **22,48 MiB**.

### File WASM nella production build (lockfile reale)

| Elemento | Risultato |
|---|---|
| Pacchetto | `onnxruntime-web` 1.26.0-dev (via transformers) |
| Versione lockfile | 1.26.0-dev.20260416-b7804b056c |
| File WASM | `.output/public/assets/ort-wasm-simd-threaded.asyncify-DMmc6YqF.wasm` |
| Dimensione bytes | **23.567.050 B** |
| Dimensione MiB | **22,48 MiB** |
| Initial bundle? | **No** (l'HTML iniziale referenzia solo i chunk `index-*` e `PhoneFrame-*`) |
| Lazy loaded? | Sì: referenziato solo da `transformers.web-*.js`, chunk importato dinamicamente da `visual-embedding.ts` e `outfit-segmentation.ts` (duplicati visivi, segmentazione in Add Item / Batch Review / Outfit Scan / Log Wear) |
| Asset production build | Sì, emesso da Vite |
| >25 MiB? | **No** (limite = 26.214.400 B; margine 2,52 MiB) |
| Cloudflare effettivamente a rischio? | **No** con il lockfile attuale |
| Evidenza | build pulita da lockfile verificato via sha512; limite da documentazione Cloudflare (sotto) |

| Elemento | Risultato |
|---|---|
| Pacchetto | `onnxruntime-web` 1.21.0 (via `@imgly/background-removal`) |
| Versione lockfile | 1.21.0 |
| File WASM | `.output/public/assets/ort-wasm-simd-threaded.jsep-D5Jk56-t.wasm` |
| Dimensione bytes | **23.914.392 B** |
| Dimensione MiB | **22,81 MiB** |
| Initial bundle? | **No** |
| Lazy loaded? | Sì: referenziato solo da `ort.bundle.min-*.js` / `ort.webgpu.bundle.min-*.js`, importati dinamicamente da imgly |
| Asset production build | Sì, emesso da Vite |
| >25 MiB? | **No** (margine 2,19 MiB) |
| Cloudflare effettivamente a rischio? | **No** con il lockfile attuale |
| Evidenza | come sopra |

Sono **2 file separati**, entrambi sotto il limite. Il pacchetto 1.26-dev contiene anche `ort-wasm-simd-threaded.jsep.wasm` da
26.101.073 B (24,89 MiB, comunque sotto 25 MiB), ma la build **non lo emette**.

### Questi file vengono davvero scaricati dal dominio di AURA?

Dal codice delle librerie: **normalmente no**.
- **transformers** imposta `wasmPaths` su `https://cdn.jsdelivr.net/npm/onnxruntime-web@<versione>/dist/` (`transformers.web.js:7786-7795`). Il percorso locale `/assets/…asyncify.wasm` viene usato solo se `wasmPaths` non è impostato, e il progetto non lo imposta (nessun `wasmPaths` / `env.backends` in `src/`).
- **imgly** imposta `wasmPaths` sulle risorse del suo `publicPath`, cioè `staticimgly.com` (`@imgly/background-removal/dist/index.mjs:1019-1025`).

Vite li emette comunque perché il codice di onnxruntime contiene `new URL("…wasm", import.meta.url)`. Il limite di Cloudflare però si applica al **caricamento degli asset al deploy**, non al download a runtime: per questo conta la dimensione nel build, che è sotto soglia.

### Limite Cloudflare (documentazione ufficiale)

`developers.cloudflare.com/workers/platform/limits` → Static Assets: **Individual file size 25 MiB** (Free e Paid).
La build genera `.output/server/wrangler.json` con `"assets": { "binding": "ASSETS", "directory": "../public" }`, quindi
tutti i file di `.output/public`, `.wasm` compresi, verrebbero caricati come **Workers Static Assets** e sarebbero soggetti al limite.

### Cosa NON ho potuto verificare e quale evidenza manca

| Cosa | Perché non verificabile qui | Evidenza che servirebbe |
|---|---|---|
| Che Lovable pubblichi con `wrangler deploy` / Workers Static Assets usando il `wrangler.json` generato | la pipeline di pubblicazione di Lovable non è visibile da repo né dal connettore | log di pubblicazione di Lovable, o conferma del supporto Lovable sull'hosting di `*.lovable.app` |
| Quali file sono effettivamente online | il dominio `aura-wardrobe-intelligence.lovable.app` è **bloccato dalla network policy** di questo ambiente (sia `curl` sia WebFetch) | da un tuo browser: aprire `https://aura-wardrobe-intelligence.lovable.app/assets/ort-wasm-simd-threaded.asyncify-DMmc6YqF.wasm`. Se risponde, il nome con hash coincide con la build da lockfile e la dimensione (DevTools → Network) deve essere 23.567.050 B |
| Che Lovable usi `bun.lock` così com'è | dedotto (il lockfile punta al loro registry e `bunfig.toml` ha le loro esclusioni), non osservato | log di build di Lovable |

**Conclusione:** con le dipendenze bloccate dal lockfile il rischio **non sussiste oggi**: i due `.wasm` reali sono 22,48 e
22,81 MiB. Il rischio era un artefatto della mia installazione senza lockfile. Diventerebbe reale se in futuro
`@huggingface/transformers` venisse aggiornato a una versione che porta `onnxruntime-web` ≥ 1.31-dev (il file da 25,6 MiB).
Prima di qualsiasi aggiornamento di quella libreria va ricontrollato.
