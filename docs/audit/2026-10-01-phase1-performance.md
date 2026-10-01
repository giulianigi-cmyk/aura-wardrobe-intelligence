# AURA — Fase 1: performance, velocità, usabilità

Branch: `claude/aura-audit-commercial-structure-dgc74y` (base: `main` @ `89af6af`).
Nessuna modifica a FREE/PLUS/ULTRA, paywall, abbonamenti, schema DB, privacy policy.

## Metodo di misura

- **Build di produzione** reale (`vite build`, preset `cloudflare-module`) servita in locale con `wrangler dev`
  (stesso runtime workerd di Cloudflare).
- **Browser**: Chromium headless via Playwright, viewport mobile 390×844 @3x, touch, **CPU rallentata 4×**
  e rete limitata (~9 Mbit/s, 150 ms RTT ≈ 4G buono). Cache vuota a ogni run, 5 run, valore mediano.
- **Bundle**: dimensioni minificate e gzip (-9) dei file in `.output/public/assets`; composizione dei chunk ricavata
  dai sourcemap (byte attribuiti per modulo).
- **Limite**: le schermate dietro login (Home, Wardrobe, Stylist, Planner…) **non sono misurabili nel browser**
  in questo ambiente: non ho credenziali e non creo account sul DB di produzione. Per quelle schermate le analisi
  sono statiche (codice) e sui dati reali aggregati del DB (sola lettura).
- Nota ambiente: il file `ort-wasm-simd-threaded.asyncify.wasm` (onnxruntime, usato da `@huggingface/transformers`)
  risulta **25,6 MiB**, oltre il limite di 25 MiB per asset di Cloudflare Workers; per servire la build in locale l'ho
  spostato fuori da `.output` (non è caricato all'avvio). Le versioni sono risolte dal registry npm pubblico perché il
  registry Lovable di `bun.lock` non è raggiungibile da qui: **da verificare** che la build Lovable non abbia lo stesso file.

## BEFORE

### Bundle

| Asset caricato all'avvio | Minificato | Gzip |
|---|---:|---:|
| `index-Jl…js` (route `/`: tutta l'app) | 1.555.300 B | 440.174 B |
| `index-Dg…js` (framework: react-dom, Supabase, router) | 639.907 B | 189.836 B |
| `PhoneFrame…js` | 5.682 B | 2.607 B |
| **Totale JS iniziale (3 file)** | **2.200.889 B (2,10 MiB)** | **632.617 B (618 KiB)** |
| `styles…css` | 108.389 B | 17.838 B |

Chunk non iniziali già lazy: `transformers.web` (573 KB), `ort.bundle` ×2 (395 KB ciascuno), `visual-embedding`.

Composizione del chunk route `index-Jl` (sourcemap, byte minificati):
schermate non-tab ≈ 353 KB · schermate tab + avvio ≈ 191 KB · componenti/lib ≈ 223 KB ·
**traduzioni 4 lingue ≈ 316 KB** · npm ≈ 432 KB di cui **MediaPipe 123 KB**, zod 87 KB, **imgly 80 KB**,
i18next 43 KB, qrcode 24 KB, react-easy-crop 22 KB, lucide 20 KB, html-to-image 13 KB.

### Startup (utente non loggato, build di produzione, mediana di 5 run)

| Metrica | Valore |
|---|---:|
| JS scaricato | 624 KiB (3 richieste) |
| First Contentful Paint (splash) | 604 ms |
| Splash visibile | 286 ms dalla navigazione |
| **Uscita dallo splash** (schermata successiva visibile) | **2.956 ms** |
| Total Blocking Time | 236 ms (task più lungo 208 ms) |

Lo splash resta a schermo ≈ 2,7 s: ≈ 1,1–1,3 s di caricamento/idratazione + **1.600 ms di attesa fissa**.

### Cosa succede all'avvio (codice)

- `AuraApp.tsx:218-229`: dopo che l'auth è pronta, **`setTimeout(…, 1600)`** prima di scegliere la schermata —
  vale anche per l'utente già loggato con dati pronti.
- Tutte le ~45 schermate importate staticamente in `AuraApp.tsx:1-45` → nel bundle iniziale, incluse
  MediaPipe (via `PersonalColorAnalysis`, `Avatar`, `AvatarTryOn`) e imgly (via `Wardrobe`, `AddItem`, `BatchReview`, `OutfitScan`).
- `i18n/config.ts:3-6`: i JSON delle 4 lingue importati staticamente.
- Utente loggato, all'avvio: profilo + URL firmato avatar (`use-profile`), canale realtime notifiche
  (`use-chat-notifications`), backfill thumbnail outfit dopo 4 s (una query se non c'è nulla da fare), poi Home.
- Google Fonts caricati da CSS esterno bloccante (`__root.tsx`).

### Navigazione tra tab (analisi del codice; non misurabile senza login)

- I 5 tab restano montati (bene) e wardrobe/outfit/piani/profilo usano React Query con `staleTime` 5–60 min (bene).
- **Home** (`Home.tsx:51-52`): a ogni ritorno sul tab incrementa `refreshKey` → rimette `looksLoading = true`
  (le card dei look tornano skeleton), rilegge `home_suggestions`, riconta gli outfit, **ri-firma** le immagini.
- **Stylist** (`AIStylist.tsx:318`): a ogni ritorno `load()` rimette `loading = true` → nasconde "piani di oggi" e
  "da confermare" e mostra lo spinner; poi 2–4 query + una `createSignedUrl` **sequenziale per ogni foto** indossata.
- **URL firmati non stabili**: ogni schermata firma le stesse immagini per conto suo (`resolveWardrobeUrls` usata da
  Home, Wardrobe, Stylist, OutfitBuilder, TripDetail, Shop, ColorLab, OutfitViewerSheet…). Ogni firma produce un URL
  diverso (token con timestamp) → **il browser riscarica la stessa immagine** perché la cache HTTP è per URL.

### Wardrobe e immagini (dati reali, sola lettura)

- Griglia: rende **tutti** i capi (nessuna virtualizzazione), `<img loading="lazy">` ✓.
- **Cascata senza tetto** `animationDelay: i * 0.04s` (`Wardrobe.tsx:996`): con 461 capi l'ultimo appare dopo 18 s;
  il capo n° 100 dopo 4 s (gli elementi restano invisibili fino allo scadere del delay).
- Thumbnail: JPEG 400 px, **media 17 KB**. Immagine piena: PNG, **media 616 KB, p90 1,4 MB**.
- **257 capi su 549 senza thumbnail**: 255 creati prima del 10 agosto (introduzione della pipeline thumbnail in
  `AddItem.tsx:809-819`, `BatchReview.tsx:448`, `Wardrobe.tsx:376,424`), 2 dopo (thumbnail fallita, il codice ripiega
  sull'originale). Per quei capi la griglia scarica l'originale: ≈ **36× più pesante**.
- `resolveWardrobeUrls` firma sempre sia thumbnail che originale per ogni capo.
- Home: le miniature dei look usano l'immagine **originale** (`Home.tsx` `thumbFor` → path di `image_url`).

### Animazioni

- Globali già brevi (`styles.css`: fade-in 180 ms, fade-up 250 ms, scale-in 200 ms, slide-up 280 ms) ✓.
- Splash: contenuti con `animationDelay` 0,6 s e 1 s (`Splash.tsx:25,49`).
- Bottom sheet shadcn: apertura 500 ms (`ui/sheet.tsx:34`).
- Cascata Wardrobe (sopra).

### Build / test

`tsc --noEmit` 0 errori · `bun test src/lib` 117/117 · `vite build` OK (warning chunk > 500 KB, import misto `outfit-thumb`) ·
`eslint` 9.880 segnalazioni preesistenti (4.674 prettier).

---

## INTERVENTI (uno alla volta: misura → modifica → build → typecheck → test → misura)

| # | Intervento | Commit | Effetto misurato |
|---|---|---|---|
| 1 | **Splash**: rimossa l'attesa fissa di 1.600 ms; si esce appena auth (e, se loggati, il profilo) sono pronti. Delay dei contenuti dello splash 0,6 s / 1 s → 0,1 s / 0,15 s | `931b3d0` | uscita dallo splash 2.956 → 1.371 ms |
| 2 | **Lazy loading** di 36 schermate non-tab (`React.lazy` + `Suspense` con sfondo neutro); prefetch in idle delle 15 più usate dopo il login; ricarica automatica una volta se un chunk manca dopo un deploy. Restano immediati: i 5 tab, Splash, Onboarding, Auth | `d59075a` | JS iniziale 2.200.903 → 1.602.116 B; MediaPipe separato; warning `outfit-thumb` sparito |
| 3 | **Librerie pesanti on demand**: imgly (scontorno), qrcode, react-easy-crop (cropper avatar) | `bb0ce63` | JS iniziale → 1.467.005 B |
| 4 | **Traduzioni**: inglese incluso (lingua del render server e fallback), it/es/fr scaricate solo se attive; cambio lingua invariato per tutti i chiamanti | `0756db1` | JS iniziale → 1.207.852 B |
| 5 | **Immagini**: cache condivisa degli URL firmati (stesso URL per lo stesso file tra schermate → niente download ripetuti); cascata Wardrobe limitata ai primi 12 capi; `decoding="async"` sulla griglia; card dei look curati in Home con thumbnail | `0f37231` | non misurabile senza login (vedi sotto) |
| 6 | **Refetch**: Home e Stylist ricaricano in background senza tornare a skeleton/spinner; firma delle foto indossate in un'unica richiesta; `staleTime` 50 min sull'URL dell'avatar (prima rifirmato a ogni mount dei 16 consumer di `useProfile`) | `952b2e3` | non misurabile senza login |
| 7 | **Planner**: stesso refresh silenzioso; eventi calendario attivi + nascosti in una sola query invece di due | `48a60f1` | non misurabile senza login |

Rollback: nessuno necessario (nessun intervento ha peggiorato le metriche).
Animazioni: nessuna modifica oltre a splash e cascata — le globali sono già 180–280 ms; lo sheet shadcn da 500 ms
non è usato dall'app; i `duration-500` restanti sono feedback al tocco.

## BEFORE / AFTER

Misura finale affiancata (stessa macchina, stesse condizioni, originale `89af6af` e versione nuova servite in parallelo,
2 round × 4 run, mediana per round).

| Metrica | BEFORE | AFTER |
|---|---:|---:|
| Initial JS (minificato) | 2.200.903 B (2,10 MiB) | 1.208.381 B (1,15 MiB) — **−45%** |
| Gzip | 632.668 B (618 KiB) | 359.712 B (351 KiB) — **−43%** |
| Numero chunk JS iniziali | 3 | 3 (+1 chunk lingua da ~28 KiB gzip per utenti it/es/fr) |
| JS scaricato dal browser all'avvio | 624 KiB | 355 KiB |
| Splash (uscita, mobile emulato) | 2.982 / 2.944 ms | **1.247 / 1.231 ms** |
| First Contentful Paint | 580 / 652 ms | 584 / 580 ms |
| Total Blocking Time | 251 / 235 ms | 188 / 203 ms |
| Task più lungo | 198 / 192 ms | 146 / 158 ms |
| Home interactive | non misurabile con gli strumenti disponibili (richiede login) | non misurabile |
| Wardrobe open | non misurabile con gli strumenti disponibili (richiede login) | non misurabile |
| Stylist open | non misurabile con gli strumenti disponibili (richiede login) | non misurabile |
| Planner open | non misurabile con gli strumenti disponibili (richiede login) | non misurabile |

Note oneste sulla misura:
- Per un utente con lingua italiana il JS iniziale effettivo è 1.208.381 + 84.686 B (chunk `it`) ≈ 1,23 MiB
  (≈ 379 KiB gzip), sempre −42% rispetto a prima.
- L'emulazione di rete su loopback non sembra rallentare davvero i download (il tempo di `load` è quasi identico con
  624 e 355 KiB): il guadagno misurato viene dall'attesa rimossa e da meno JS da eseguire. Su una rete mobile reale i
  ~263 KiB gzip in meno si aggiungono (stima ≈ 0,2–0,3 s su 4G), ma **non è misurato**.
- Per i tab dietro login il miglioramento atteso (niente skeleton al ritorno, immagini non riscaricate) è verificato
  sul codice e con unit test della cache, non con misure nel browser.

## TEST ESEGUITI

| Test | Risultato |
|---|---|
| `tsc --noEmit` dopo ogni intervento | ✅ 0 errori |
| `bun test src/lib` | ✅ 123/123 (117 preesistenti + 6 nuovi per la cache degli URL firmati) |
| `vite build` produzione dopo ogni intervento | ✅ (resta solo il warning "chunk > 500 KB", vedi sotto) |
| Lint sui file toccati (escluso prettier), confronto con l'originale | ✅ nessuna segnalazione nuova (1 in meno) |
| Browser — avvio: splash → onboarding | ✅ |
| Browser — onboarding "Skip" → login → passaggio a registrazione | ✅ |
| Browser — selettore lingua in registrazione → Español (carica solo `es`) | ✅ testo tradotto, nessun errore |
| Browser — lingua salvata `it` / `fr` all'avvio (carica solo quel chunk) | ✅ |
| Browser — schermata reset password (schermata lazy) | ✅ |
| Browser — caricamento di **tutti** i 39 chunk schermata + 24 chunk libreria/lingua | ✅ 0 errori |
| Browser — generazione QR dal chunk `qrcode` dinamico; export imgly presente | ✅ |
| Signup reale, login, logout | ⏸ non eseguiti: richiedono un account sul DB di produzione |
| Profile setup, username, preferenze; Wardrobe (aggiunta, manuale, AI, URL, modifica, eliminazione, filtri, ricerca); Outfit (AI, manuale, salvataggio, My Outfits, calendario); Stylist; Planner; Valigia; Purchase Advisor; Social (ricerca, QR, profilo, chat 1:1) | ⏸ **da verificare manualmente** con il tuo account (checklist sotto) |

Checklist manuale consigliata (sul deploy di questo branch, con il tuo account):
1. Apertura a freddo: lo splash sparisce appena l'app è pronta; un nuovo account arriva al profile setup.
2. Home → Wardrobe → Stylist → Planner → Home → Stylist: al ritorno i contenuti restano visibili (niente skeleton) e le
   immagini non lampeggiano.
3. Wardrobe: scroll fino in fondo — i capi compaiono subito; apertura dettaglio; aggiunta capo (foto con scontorno,
   manuale, URL); il primo scontorno può impiegare qualche istante in più (download della libreria, una volta sola).
4. Apertura di Add Item, Outfit Builder, Stylist chat, Trips, Settings dopo qualche secondo dal login: devono aprirsi
   istantaneamente (prefetch).
5. Armocromia / Avatar / Batch review / Outfit scan: primo accesso con un breve caricamento (modelli scaricati solo lì).
6. Profilo: cambio foto (cropper), QR code, cambio lingua da Impostazioni.

## PROBLEMI RIMASTI (performance)

| Problema | Impatto | Proposta | Priorità |
|---|---|---|---|
| 257 capi senza thumbnail (255 creati prima del 10 agosto): la griglia scarica originali da ~616 KB invece di ~17 KB | alto per guardaroba grandi (il tuo) | backfill thumbnail come quello già esistente per gli outfit (`backfillOutfitThumbs`) — **scrive su storage/DB, quindi rimandato alla tua approvazione** | HIGH |
| Griglia Wardrobe senza virtualizzazione (tutti i capi nel DOM) | da misurare con login | `content-visibility` o virtualizzazione se le misure lo confermano | MEDIUM |
| zod (86 KB) nel chunk iniziale, portato dai `*.functions.ts` importati dai tab | ~25 KiB gzip | richiede di separare validatori e server function: non è una modifica piccola | LOW |
| Chunk framework 640 KB (react-dom, Supabase, router) | inevitabile | eventuale `manualChunks` solo per la cache tra deploy | LOW |
| Errore React #418 (hydration mismatch) per utenti non inglesi | il server renderizza in inglese, il client nella lingua salvata: React ri-renderizza | preesistente e identico nella versione originale; da risolvere rendendo lo splash indipendente dalla lingua o passando la lingua al server | LOW |
| Asset `ort-wasm-simd-threaded.asyncify.wasm` da 25,6 MiB (con le versioni risolte qui) supera il limite di 25 MiB di Cloudflare | possibile problema di deploy se la build Lovable ha la stessa versione | verificare la versione nel lockfile Lovable; eventuale esclusione dell'asset non usato | da verificare |
| Stylist non in streaming (fino a 25 s di attesa) | percezione lentezza AI | streaming della risposta — tocca l'integrazione AI, rimandato | MEDIUM |
| Google Fonts esterni bloccanti | primo render | self-host dei 2 font | LOW |
| Riduzione dei tap (aggiunta capo, salvataggio outfit…) | UX | non modificata: senza poter usare l'app da loggato il rischio di peggiorare il flusso è alto | — |

## SECURITY / PRIVACY ISSUES FOUND

Nessuna modifica di sicurezza in questa fase. Problemi rilevati (già documentati negli audit precedenti, ancora aperti):

| Problema | Gravità | File | Cosa correggere | Prima della pubblicazione? |
|---|---|---|---|---|
| Nessun limite server-side sulle API AI a pagamento | HIGH | tutte le `*.functions.ts` AI | quote server-side (fase entitlement) | sì |
| Quota Firecrawl fail-open; RPC `consume_firecrawl_credit` assente in produzione; limite passato dal chiamante | HIGH | `src/lib/import-url.functions.ts:667-698` | limite deciso dal server, fail-closed | sì |
| Cancellazione account incompleta: profilo senza FK (3 profili orfani), `outfit_plans` e `wardrobe_item_valuations` senza FK, bucket `avatar-private` / `outfit-photos` / `shared-library` non svuotati, paginazione storage a 1000 file | HIGH (GDPR/store) | `src/lib/delete-account.functions.ts`, schema DB | piano in `2026-10-01-proposal-v2.md` §7 | sì |
| Token OAuth calendario e password specifica Apple salvati in chiaro | MEDIUM | `calendar-connections.functions.ts`, `calendar_connections` | cifratura (Vault) | sì |
| Stack trace mostrato agli utenti nella pagina d'errore | MEDIUM | `src/routes/__root.tsx` | solo owner/dev | sì |
| Schermata Storage Debug visibile a tutti dal Profilo | MEDIUM | `Profile.tsx` (bottone), `StorageDebug.tsx` | solo owner | sì |
| La nuova cache degli URL firmati vive solo in memoria nella scheda corrente; i path sono già limitati alla cartella dell'utente | info | `src/lib/signed-url-cache.ts` | nessuna azione | — |

## FILE MODIFICATI

| File | Modifica | Motivo |
|---|---|---|
| `src/components/aura/AuraApp.tsx` | splash senza timer; 36 schermate con `lazyScreen` + `Suspense`; prefetch in idle; reload unico su chunk mancante | startup e bundle |
| `src/hooks/use-profile.tsx` | nuovo campo `settled`; `staleTime` sull'URL avatar | routing dallo splash; niente refetch dell'avatar |
| `src/components/aura/screens/Splash.tsx` | delay 0,6/1 s → 0,1/0,15 s | niente attese artificiali |
| `src/lib/bg-removal-client.ts` | import dinamico di imgly | bundle |
| `src/components/aura/MyQrCode.tsx` | import dinamico di qrcode | bundle |
| `src/components/aura/screens/Profile.tsx` | cropper avatar lazy | bundle |
| `src/i18n/config.ts` | solo inglese incluso; altre lingue caricate on demand | bundle |
| `src/lib/signed-url-cache.ts` (nuovo) | cache condivisa URL firmati | immagini non riscaricate |
| `src/lib/signed-url-cache.test.ts` (nuovo) | 6 unit test | verifica della cache |
| `src/lib/wardrobe-image.ts` | `resolveWardrobeUrls` usa la cache | idem |
| `src/components/aura/screens/Home.tsx` | refresh silenzioso; cache per i look composti; thumbnail nelle card curate | refetch e immagini |
| `src/components/aura/screens/AIStylist.tsx` | refresh silenzioso; firma foto in batch con cache | refetch |
| `src/components/aura/screens/Planner.tsx` | refresh silenzioso; una query calendario invece di due | refetch |
| `src/components/aura/screens/Wardrobe.tsx` | cascata limitata a 12 elementi; `decoding="async"` | percezione velocità |

Non toccati (come richiesto): `outfit-plans-query.ts`, schema DB, community/chat, logica AI/prompt, privacy/terms,
account owner, qualsiasi parte di FREE/PLUS/ULTRA.

## FILE NON MODIFICATI MA NECESSARI NELLA FASE SUCCESSIVA

- **Thumbnail backfill**: `src/lib/outfit-thumb.ts` (modello da riusare), `src/lib/wardrobe-image.ts`, `src/lib/image-compress.ts`.
- **Entitlement / quote**: tutte le `src/lib/*.functions.ts` che chiamano AI (`ai-analyze`, `ai-suggest-outfit`,
  `suggest-daily-looks`, `stylist-chat`, `purchase-advisor`, `wardrobe-gap`, `import-url`, `outfit-garment-extract`,
  `avatar-tryon`, `photo-enhance`, `voice-*`, `weekly-outfits`, `trip-capsule`, `batch-scan`), `src/integrations/supabase/auth-middleware.ts`.
- **Sicurezza**: `src/lib/delete-account.functions.ts`, `src/lib/import-url.functions.ts`, `src/routes/__root.tsx`,
  `src/components/aura/screens/Profile.tsx` / `StorageDebug.tsx`, `src/lib/calendar-connections.functions.ts`.
- **Wardrobe a grandi volumi**: `src/components/aura/screens/Wardrobe.tsx` (eventuale virtualizzazione, dopo misure da loggato).
