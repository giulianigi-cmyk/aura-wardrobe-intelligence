# AURA — Audit, proposta FREE / PLUS / ULTRA, performance, security, store readiness

Data: 2026-10-01 · Fase: **STEP 1–8 (audit + proposta)**. Nessun file di codice applicativo è stato modificato.
L'implementazione (STEP 9+) parte solo dopo l'approvazione di questa struttura.

Metodo: lettura del codice (`src/`, `supabase/`, `drizzle/`), interrogazioni **in sola lettura (SELECT)** sul DB
di produzione tramite il connettore Lovable (policy RLS, bucket, cron, conteggi aggregati), typecheck, lint,
unit test e build di produzione eseguiti in locale. I flussi end-to-end con le API AI reali **non** sono stati
eseguiti (servirebbero le chiavi segrete del server): lo "Stato" delle funzionalità deriva da codice + dati d'uso reali.

---

## A. ARCHITETTURA ATTUALE

| Livello | Tecnologia reale nel progetto |
|---|---|
| Framework | **TanStack Start** (React 19, SSR) + TanStack Router + React Query, generato/gestito con **Lovable** |
| Hosting/runtime | **Cloudflare Workers** (`wrangler.jsonc`, `@cloudflare/vite-plugin`, nitro) — dominio `aura-wardrobe-intelligence.lovable.app` |
| Backend | **Server functions** TanStack (`src/lib/*.functions.ts`, ~90 funzioni), tutte con middleware `requireSupabaseAuth` (JWT verificato server-side) |
| DB / Auth / Storage | **Supabase** (Lovable Cloud): Postgres con RLS su tutte le 55 tabelle, Auth email+password, 6 bucket privati, `pg_cron` (2 job) |
| AI | **Lovable AI Gateway** → `google/gemini-2.5-flash` (analisi capi, outfit, stylist, purchase advisor, gap), `openai/gpt-image-2` (ricostruzione capo); **FASHN** (virtual try-on, photo enhance, fallback ricostruzione); **remove.bg** (scontorno server "premium"); **OpenAI** tts-1 / trascrizione (voce stylist); **Firecrawl** (import URL fallback) |
| AI on-device | `@imgly/background-removal` (scontorno), `@mediapipe/tasks-vision` (armocromia/viso/posa), `@huggingface/transformers` (embedding visivi, segmentazione) |
| Navigazione | Single route `/` → `AuraApp.tsx` con state machine `screen` (≈45 schermate). 5 tab principali restano montati (CSS hidden) |
| i18n | it / en / es / fr |
| Extra | Server **MCP** (`/mcp`, OAuth Lovable) che espone guardaroba/profilo/planner ad assistenti AI esterni |
| Mobile | **Nessun wrapper mobile**: niente Capacitor, niente PWA manifest, niente service worker |

**Sistema commerciale oggi: inesistente.** Non esistono colonne/tabelle di piano, ruolo applicativo, quote o paywall.
(L'unico `admin` nel DB è il ruolo *dentro le chat di gruppo* — `conversation_participants.role` — non un ruolo di account.)

---

## B. INVENTARIO FUNZIONALITÀ

Legenda costo AI: 0 = nessuno/on-device · € = Gemini Flash (≈ 0,001–0,01 $/chiamata, stima) · €€ = immagine generata / remove.bg / più chiamate · €€€ = FASHN try-on (multi-garment).
Le stime di costo sono ordini di grandezza da verificare sulle fatture reali (oggi **nessuna telemetria d'uso AI esiste**).

| Area | Funzionalità | Stato | File principali | AI/API | Storage/DB |
|---|---|---|---|---|---|
| Auth | Signup / login / logout email+password | funzionante | `hooks/use-auth.tsx`, `screens/Auth.tsx` | — | `auth.users` |
| Auth | Recupero password | funzionante | `screens/ResetPassword.tsx` | — | Supabase Auth |
| Auth | OAuth (Google/Apple) per login | non implementata | — | — | — |
| Auth | Account test esistenti | parziale: 2 utenti `@example.com` mai loggati, nessun ruolo/piano | — | — | — |
| Onboarding | Intro + profile setup | funzionante (flag `aura.onboarded` in localStorage, solo UX) | `Onboarding.tsx`, `ProfileSetup.tsx` | — | `profiles` |
| Profilo | Dati personali, taglie, lingua, lavoro/dress code, preferenze stile, "don'ts" | funzionante | `PersonalInfo`, `SettingsSizes`, `StylePreferences`, `SettingsDressPreferences` | — | `profiles` |
| Profilo | Style memory (apprendimento da feedback) | funzionante | `style-memory*.ts`, `outfit-feedback.functions.ts` | 0 (aggregazione SQL) | `user_style_memory`, `outfit_feedback`, `feedback_weights` |
| Armocromia | Selfie → analisi stagione/sottotono → salvataggio profilo | funzionante, **on-device** | `PersonalColorAnalysis.tsx`, `face-analyze.ts`, `personal-color.ts` | 0 (MediaPipe) | `profiles.season/undertone/value/clarity` |
| Armocromia | Color Lab (ruota colori) | funzionante | `ColorLab.tsx`, `itten-wheel.ts` | 0 | — |
| Wardrobe | Aggiunta singola con foto + riconoscimento (categoria, sottocategoria, colore, brand, materiale, stagione) | funzionante | `AddItem.tsx`, `ai-analyze.functions.ts` | € | `wardrobe_items`, bucket `wardrobe` |
| Wardrobe | Scontorno on-device / server "premium" | funzionante | `bg-removal-client.ts`, `ai-bgremove.functions.ts` | 0 / €€ (remove.bg) | bucket `wardrobe` |
| Wardrobe | Import da URL prodotto (scraping + AI) | funzionante; **quota Firecrawl non operativa** (vedi F) | `import-url.functions.ts`, `import-image.functions.ts` | € + Firecrawl | `products`, `scrape_domain_hints` |
| Wardrobe | Inserimento multiplo (batch scan asincrono) | funzionante (125 job ok / 12 falliti, 8,8%) | `BatchScan.tsx`, `BatchReview.tsx`, `batch-scan.*` | € per foto + €€ scontorno | `batch_scans`, `scan_jobs`, `scan_detected_items`, cron `drain-scan-jobs` |
| Wardrobe | Scansione outfit indossato → rilevazione capi / ricostruzione capo | funzionante | `OutfitScan.tsx`, `outfit-scan-detect`, `outfit-garment-extract` | € + €€ (gpt-image / FASHN) | `outfit_photo_detections`, bucket `outfit-photos` |
| Wardrobe | Modifica / eliminazione / label / URL / immagini alternative | funzionante | `Wardrobe.tsx`, `AddItem.tsx` | — | `wardrobe_items` |
| Wardrobe | Ri-analisi capi incompleti, migrazione tassonomia | funzionante | `reanalyze-wardrobe`, `migrate-legacy-taxonomy` | € × N | — |
| Wardrobe | Photo enhance | funzionante | `photo-enhance.functions.ts`, `fashn.server.ts` | €€ (FASHN) | — |
| Wardrobe | Location multiple del guardaroba (casa, mare…), prestiti | funzionante | `wardrobe-locations*`, `wardrobe-loans*` | — | `wardrobe_locations`, `wardrobe_loans` |
| Wardrobe | Duplicati visivi | funzionante | `visual-embedding.ts`, `outfit-wear.functions.ts` | 0 (on-device) | `visual_embeddings` |
| Wardrobe | Shared library (catalogo condiviso opt-in) | funzionante | `shared-library.*`, `PrivacySettings.tsx` | — | `shared_library_items`, bucket `shared-library` |
| Outfit | Outfit builder manuale (canvas) + AI suggest (meteo, occasione, formalità, colori, preferenze, don'ts, capo ancora) | funzionante | `OutfitBuilder.tsx`, `ai-suggest-outfit.functions.ts`, `outfit-*-rules.ts` | € | `outfits`, bucket `outfits` |
| Outfit | Look del giorno in Home (cache 1/giorno) | funzionante | `Home.tsx`, `suggest-daily-looks.functions.ts` | € (1/giorno) | `home_suggestions` |
| Outfit | My Outfits / salvati, share, condivisione | funzionante | `AIStylist.tsx` (anche `saved-outfits`), `ShareOutfitSheet.tsx` | — | `outfits`, `outfit_shares` |
| Outfit | Log wear (cosa ho indossato, da foto) | funzionante | `LogWear.tsx`, `outfit-wear.functions.ts` | € | `wardrobe_events*` |
| Stylist | Chat AURA Stylist (contesto guardaroba ≤200 capi, profilo, style memory, meteo, evento calendario) → outfit salvabile / pianificabile | funzionante, **non in streaming** (timeout 25 s) | `StylistChat.tsx`, `stylist-chat.functions.ts` | € per messaggio | — |
| Stylist | Voce (dettatura + risposta vocale) | funzionante | `voice-transcribe`, `voice-synthesize` | €€ (OpenAI) | — |
| Planner | Assegna outfit a giorno/slot, modifica, elimina | funzionante | `Planner.tsx`, `outfit-plan.functions.ts` | — | `outfit_plans` |
| Planner | Pianificazione automatica 7/14 giorni | funzionante | `weekly-outfits.functions.ts` | € × 7–14 | `outfit_plans` |
| Planner | Ricontrollo meteo orario + proposte di cambio outfit | funzionante | `plan-weather.*`, cron `recheck-plan-weather` | 0 (open-meteo) | `outfit_plans`, `notifications` |
| Planner | Sync calendario Google / Outlook / Apple (CalDAV) | funzionante | `calendar-connections`, `google-calendar.server`, `outlook-calendar.server`, `caldav.server` | — | `calendar_connections`, `calendar_events_cache` |
| Valigia | Viaggio (date, destinazioni multiple, meteo, attività) | funzionante | `TripCreate.tsx`, `TripDetail.tsx`, `trips.functions.ts`, `trip-activities` | 0 | `trips`, `trip_destinations`, `trip_day_activities` |
| Valigia | Capsule + outfit per attività (AI) | funzionante | `trip-capsule.server.ts` (1746 righe, test) | € × stati-outfit | `trip_capsule_items`, `outfit_plans` |
| Valigia | Packing list, essentials preset, import eventi calendario nel viaggio | funzionante | `trip-packing`, `essentials`, `trip-calendar-link` | — | `trip_packing_items`, `essential_presets*` |
| Purchase Advisor | URL / foto / etichetta / foto+etichetta → buy / maybe / skip, duplicati, abbinabilità, gap | funzionante | `Shop.tsx`, `purchase-advisor.functions.ts` | € (+ Firecrawl per URL) | — (nessuno storico salvato) |
| Purchase Advisor | Confronto A vs B | funzionante | `comparePurchases` | € × 2 | — |
| Purchase Advisor | Distinzione "già acquistato" vs "da acquistare" | parziale: rileva duplicati nel guardaroba, ma non c'è uno stato "wishlist/da acquistare" persistito | — | — | — |
| Insights | Statistiche uso, capi dimenticati, cost-per-wear, valore guardaroba (motore valutazione) | funzionante | `Insights.tsx`, `wardrobe-value-engine.ts` (test) | 0 | `wardrobe_item_valuations`, `valuation_*` |
| Insights | Wardrobe gap analysis (AI) | funzionante | `wardrobe-gap.functions.ts` | € | — |
| Avatar | Avatar + virtual try-on outfit | funzionante | `Avatar.tsx`, `AvatarTryOn.tsx`, `avatar-tryon.functions.ts` | €€€ (FASHN, 1 chiamata per capo, cache) | `user_avatar`, `avatar_tryon_cache`, bucket `avatar-private` |
| Social | Community feed, amici, QR/invite, chat 1:1 e gruppi, reazioni, commenti, blocco utenti | funzionante; **manca "segnala contenuto"** | `Community.tsx`, `Chats.tsx`, `ChatThread.tsx`, `community.tsx`, `chat.ts` | — | `friends`, `conversations`, `messages`, `user_blocks`, … |
| Notifiche | In-app (realtime), preferenze | funzionante; **no push** | `Notifications.tsx`, `use-unread-notifications.tsx` | — | `notifications` |
| Account | Eliminazione account in-app | parziale (non svuota 3 bucket, vedi F) | `Settings.tsx`, `delete-account.functions.ts` | — | — |
| Integrazione | Server MCP per assistenti AI esterni | funzionante | `src/lib/mcp/*`, `routes/mcp.ts` | — | lettura/scrittura scoped all'utente |
| Debug | Storage Debug | problematica: visibile a **tutti** gli utenti dal Profilo | `StorageDebug.tsx`, `Profile.tsx:433` | — | — |
| Legale | Privacy Policy / Termini | **non implementata** | — | — | — |

Dati d'uso reali (aggregati, produzione): 19 account, 549 capi (il tuo account ne ha 461; gli altri ≤ 33), 90 outfit,
116 piani, 2 viaggi, 137 scan job, 2 avatar. Il 47% dei capi (257/549) **non ha thumbnail**.

---

## C. PROPOSTA FREE / PLUS / ULTRA

Principi:
1. **FREE deve arrivare al "wow"**: digitalizzare un guardaroba piccolo ma reale, armocromia, look del giorno,
   qualche outfit AI e qualche messaggio allo Stylist, planner manuale illimitato, community.
2. **Ciò che costa 0 non si blocca** (planner manuale, armocromia on-device, style memory, community, log wear):
   bloccarlo peggiora il FREE senza risparmiare nulla.
3. **Ciò che costa si limita a quota** (Gemini), **ciò che costa molto si blocca** o va in ULTRA (FASHN, voce, gpt-image).
4. **ULTRA = funzioni diverse, non solo numeri più alti**: virtual try-on, voce, travel intelligence (multi-destinazione +
   calendario nel viaggio + 14 giorni), confronto acquisti, valore del guardaroba, connettore MCP per assistenti AI.
5. Quote **mensili** per l'AI (mese solare UTC) + **tetto giornaliero anti-abuso** uguale per tutti (es. 60 chiamate AI/giorno).

### Matrice

| Funzionalità | FREE | PLUS | ULTRA | Limite FREE | Limite PLUS | Limite ULTRA |
|---|---|---|---|---|---|---|
| Capi nel guardaroba | ✓ | ✓ | ✓ | 50 capi | 500 capi | illimitato (fair use) |
| Riconoscimento AI capo (singolo, URL, ri-analisi) | ✓ | ✓ | ✓ | 40 / mese | 400 / mese | 1.500 / mese |
| Batch scan (multi-upload) | ✓ | ✓ | ✓ | 2 batch / mese (≤10 foto) | 20 / mese | 60 / mese |
| Scontorno on-device | ✓ | ✓ | ✓ | illimitato | illimitato | illimitato |
| Scontorno server "premium" (remove.bg) | ✗ | ✓ | ✓ | — | 50 / mese | 200 / mese |
| Import da URL (Firecrawl) | ✓ | ✓ | ✓ | 10 / mese | 100 / mese | 300 / mese (+ max 20/giorno) |
| Scansione outfit indossato (rilevazione) | ✓ | ✓ | ✓ | 5 / mese | 60 / mese | 200 / mese |
| Ricostruzione capo da foto / Photo enhance | ✗ | ✓ | ✓ | — | 15 / mese | 80 / mese |
| Armocromia + Color Lab | ✓ | ✓ | ✓ | illimitato | illimitato | illimitato |
| Look del giorno (Home) | ✓ | ✓ | ✓ | 1 / giorno (cache) | 1 / giorno + rigenera 3/giorno | 1 / giorno + rigenera 10/giorno |
| Outfit AI (builder, suggerimenti Stylist tab) | ✓ | ✓ | ✓ | 30 / mese | 300 / mese | 1.200 / mese |
| Chat Stylist (messaggi) | ✓ | ✓ | ✓ | 20 / mese | 300 / mese | 1.500 / mese |
| Voce Stylist (dettatura + risposta) | ✗ | ✗ | ✓ | — | — | 300 / mese |
| Style memory / apprendimento | ✓ | ✓ | ✓ | attivo | attivo | attivo |
| Outfit salvati / share | ✓ | ✓ | ✓ | illimitato | illimitato | illimitato |
| Planner manuale (aggiungi/modifica/elimina) | ✓ | ✓ | ✓ | illimitato | illimitato | illimitato |
| Pianificazione automatica | ✗ | ✓ | ✓ | — | 7 giorni, 4 / mese | 7–14 giorni, 10 / mese |
| Proposte meteo automatiche sui piani | ✗ | ✓ | ✓ | — | ✓ | ✓ |
| Sync calendario (Google/Outlook/Apple) | ✗ | ✓ | ✓ | — | ✓ | ✓ |
| Valigia: viaggio + packing + essentials (manuale) | ✓ | ✓ | ✓ | 1 viaggio attivo | 5 viaggi attivi | illimitato |
| Valigia: capsule AI + outfit per attività | prova | ✓ | ✓ | 1 generazione una tantum | 6 / mese | 30 / mese |
| Travel intelligence: multi-destinazione + import eventi calendario nel viaggio | ✗ | ✗ | ✓ | — | — | ✓ |
| Purchase Advisor (URL / foto / etichetta) | ✓ | ✓ | ✓ | 3 / mese | 40 / mese | 150 / mese |
| Purchase Advisor: confronto A vs B | ✗ | ✗ | ✓ | — | — | 30 / mese |
| Insights base (uso, capi dimenticati, cost-per-wear) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Valore guardaroba (motore di valutazione) | ✗ | ✗ | ✓ | — | — | ✓ |
| Wardrobe gap analysis (AI) | ✗ | ✓ | ✓ | — | 4 / mese | 20 / mese |
| Location multiple del guardaroba | ✓ | ✓ | ✓ | 1 location | 3 location | illimitate |
| Prestiti, log wear, duplicati visivi | ✓ | ✓ | ✓ | illimitato | illimitato | illimitato |
| Avatar + virtual try-on | ✗ | ✗ | ✓ | — | — | 25 try-on / mese |
| Community, amici, chat | ✓ | ✓ | ✓ | illimitato | illimitato | illimitato |
| Connettore MCP (assistenti AI esterni) | ✗ | ✗ | ✓ | — | — | ✓ |

**Tutti i numeri sono proposte**, centralizzati in un unico file di configurazione: si cambiano in un punto solo.

### Motivazioni per voce (sintesi)

| Voce | Perché | Valore percepito | Frequenza | Costo | Blocco o limite | Rischio FREE troppo povero | Spostabile? |
|---|---|---|---|---|---|---|---|
| Capi 50 | 50 capi bastano per outfit reali (≈ un cambio di stagione); gli utenti reali oggi ne hanno ≤ 33 | alto | una tantum | storage | limite | basso | soglia modificabile |
| Riconoscimento AI capo | è l'ingresso del prodotto: senza, AURA non parte | altissimo | alta all'inizio | € | limite | alto se < 40 | — |
| Batch scan | accelera l'onboarding (wow), ma moltiplica le chiamate | alto | bassa | € × foto | limite | medio | — |
| Scontorno server | l'on-device è gratis e già default | medio | media | €€ | blocco FREE | basso | — |
| Ricostruzione / enhance | genera immagini (gpt-image/FASHN) | medio-alto | bassa | €€ | blocco FREE | basso | ULTRA possibile |
| Armocromia | on-device, alimenta tutta l'AI, momento wow | alto | una tantum | 0 | libero | — | no (non bloccare) |
| Look del giorno | il "motivo per aprire l'app ogni giorno" | altissimo | quotidiana | € 1/giorno | libero (cache) | — | — |
| Outfit AI / Chat | cuore dell'esperienza, costo per chiamata contenuto | altissimo | alta | € | limite | **alto**: sotto 20/mese il FREE diventa una demo | — |
| Voce | costo OpenAI, effetto "assistente personale" | medio-alto | media | €€ | ULTRA | nullo | PLUS se il costo lo consente |
| Pianificazione automatica | 7–14 chiamate AI per uso | alto per utenti abituali | settimanale | € × 14 | blocco FREE | basso (planner manuale resta) | 14 gg → ULTRA |
| Sync calendario | utente regolare, integrazione | alto | continua | 0 (API gratuite) | blocco FREE | basso | — |
| Valigia | PLUS come richiesto; FREE vede valore con 1 viaggio + 1 capsule di prova | alto | rara (stagionale) | € × attività | limite + prova | basso | — |
| Travel intelligence | multi-destinazione e calendario-nel-viaggio sono funzioni esistenti avanzate | alto per chi viaggia | rara | € | ULTRA | nullo | PLUS se serve più valore PLUS |
| Purchase Advisor | 3/mese fa capire il valore ("non comprarlo, ne hai già 2") | alto | media | € (+ Firecrawl) | limite | basso | — |
| Confronto A/B | doppio costo, funzione avanzata | medio | bassa | € × 2 | ULTRA | nullo | PLUS |
| Valore guardaroba | analisi avanzata, nessun costo AI | medio-alto | bassa | 0 | ULTRA (differenziante) | basso | PLUS |
| Gap analysis | AI, utile a chi usa regolarmente | medio | mensile | € | blocco FREE | basso | — |
| Try-on | la funzione più costosa (1 chiamata FASHN per capo) | altissimo | media | €€€ | ULTRA | nullo | — |
| MCP | power user, nessun costo AI per noi | medio | bassa | 0 | ULTRA | nullo | PLUS |
| Community / chat | effetto rete: bloccarla riduce la crescita | medio | alta | 0 | libero | — | no |

---

## D. ACCOUNT, RUOLO E PIANO (architettura proposta)

### Modello dati (nuova migrazione)

```text
user_roles          (user_id PK → auth.users, role: 'user' | 'owner', simulated_plan: plan | null)
user_subscriptions  (user_id PK, plan: 'free'|'plus'|'ultra', status: 'active'|'trialing'|'grace'|'expired'|'canceled',
                     source: 'internal'|'test'|'promo'|'app_store'|'play_store',
                     product_id, original_transaction_id, environment: 'production'|'sandbox',
                     current_period_end, auto_renew, updated_at)
usage_counters      (user_id, feature, period_start, count)  PK(user_id, feature, period_start)
subscription_events (log append-only di acquisto/rinnovo/scadenza/cancellazione/restore — per i futuri webhook store)
```

**Regola di sicurezza fondamentale:** il piano **NON** va su `profiles`. La policy RLS attuale
`Users can update own profile` permette all'utente di aggiornare qualsiasi colonna del proprio profilo dal browser:
un `subscription_plan` lì sarebbe auto-promuovibile. Le nuove tabelle avranno RLS con **solo SELECT della propria riga**;
nessuna INSERT/UPDATE/DELETE per `authenticated`. Scrive solo il server (service role) — oggi via SQL/admin, domani via webhook store.
`consume_quota()` sarà una funzione `SECURITY DEFINER` eseguibile **solo** dal service role: il limite lo calcola il server
dal catalogo, il client non lo passa mai (a differenza dell'attuale RPC Firecrawl).

### Flusso centralizzato

```text
USER → ROLE (user_roles) → PLAN effettivo (user_subscriptions, status/scadenza) → ENTITLEMENTS (catalogo unico)
     → QUOTA (usage_counters) → ACCESS (server) → PAYWALL (client)
```

- `src/lib/plans/catalog.ts` — **unica fonte di verità**: feature → piano minimo, quota per piano, periodo. Spostare
  una feature da PLUS a ULTRA = cambiare 1 riga. Condiviso tra server (enforcement) e client (UI).
- `src/lib/plans/entitlements.server.ts` — `enforceFeature(ctx, feature)`: legge ruolo+piano dal DB, applica owner
  override, consuma quota atomicamente, lancia errore tipizzato `{ code: 'upgrade_required' | 'quota_exceeded', feature, requiredPlan, resetsAt }`.
  Ogni server function AI aggiunge **una riga** con la propria chiave feature. Su errore dell'AI la quota viene restituita.
- `getMyEntitlements` (server fn) + `useEntitlements()` (React Query) — piano, ruolo, feature, quote usate/residue per la UI.
- `<PaywallSheet>` unico + `usePaywall()` — mostra **"Disponibile con PLUS"** o **"Disponibile con ULTRA"** in base al
  piano richiesto vs piano attuale; bottom sheet nello stile AURA, non blocca la pagina, responsive.
  Nessun prezzo hardcoded: i prezzi arriveranno dallo store (product ID nel catalogo).

### I 4 scenari

| Scenario | role | plan | Comportamento |
|---|---|---|---|
| **1. Il tuo account** (giulia.nigi@gmail.com) | `owner` | `free` | Resta tecnicamente FREE. **Owner override server-side**: tutte le feature, nessuna quota bloccante (l'uso viene comunque contato). In più può impostare `simulated_plan` = free/plus/ultra (scrivibile solo tramite server fn che verifica `role = owner` nel DB) per vedere esattamente paywall e limiti di ogni piano; "nessuna simulazione" = override completo. |
| **2. USER + FREE** | `user` | `free` | Nessun override, limiti FREE reali, paywall verso PLUS (e verso ULTRA per le feature ULTRA). |
| **3. USER + PLUS** | `user` | `plus` (`source='test'`) | Entitlement e quote PLUS; paywall verso ULTRA. |
| **4. USER + ULTRA** | `user` | `ultra` (`source='test'`) | Tutto ULTRA con quote ULTRA; nessun paywall PLUS. |

L'override non usa localStorage, query param o variabili JS: è una riga in `user_roles` non modificabile dal client,
verificata dal server a ogni chiamata.

### Predisposizione App Store / Google Play

`user_subscriptions` + `subscription_events` coprono product ID, stato, rinnovo, scadenza, cancellazione, restore,
sandbox. Il collegamento futuro sarà un endpoint server (webhook) che aggiorna queste tabelle — direttamente
(App Store Server Notifications v2 / Google RTDN) oppure tramite **RevenueCat** (consigliato: un'unica integrazione
per entrambi gli store, restore e sandbox gestiti). Nessuna logica di pagamento nei componenti.

---

## E. PERFORMANCE

Misure reali dalla build di produzione (`vite build`):

- Chunk della route `/` (`index-*.js`): **1,55 MB minificato / 441 KB gzip** — contiene tutte le ~45 schermate,
  MediaPipe, imgly, zod (308 riferimenti), i18n. Più il chunk core 640 KB / 190 KB gzip.
  → **≈ 630 KB gzip di JS prima dell'interazione.**
- `transformers.web` (573 KB) e onnxruntime sono già lazy (import dinamico) ✓.
- Animazioni globali già brevi (fade-in 180 ms, fade-up 250 ms, slide-up 280 ms) ✓.
- React Query con `staleTime` corretti su wardrobe/outfits/plans/profilo/locations ✓; 5 tab mantenuti montati ✓.

| # | Problema | Impatto | Causa | Soluzione | Priorità |
|---|---|---|---|---|---|
| 1 | Bundle iniziale ≈ 630 KB gzip | TTI lento su mobile/4G, peggiore nel wrapper store | `AuraApp.tsx` importa staticamente ~45 schermate; `face-analyze`, `face-restore`, `avatar-body-check` (MediaPipe) e `bg-removal-client` (imgly) importati staticamente | `React.lazy` per le schermate non-tab; `import()` dinamico di MediaPipe/imgly al momento dell'uso. Target: < 250 KB gzip iniziali | **HIGH** |
| 2 | Splash forzato **1.600 ms** a ogni avvio | +1,6 s su ogni apertura, anche con sessione e dati pronti | `setTimeout(..., 1600)` in `AuraApp.tsx:222` | Navigare appena auth/profilo sono risolti (splash solo finché serve) | **HIGH** |
| 3 | Cascata Wardrobe senza tetto | Con 461 capi, il capo n°100 appare dopo 4 s, il n°461 dopo 18 s (invisibili fino ad allora, `fill-mode: backwards`) | `animationDelay: i * 0.04s` in `Wardrobe.tsx:996` | Cascata solo sui primi ~12 elementi (max ≈ 0,45 s), poi nessun delay | **HIGH** |
| 4 | Thumbnail mancanti per il 47% dei capi | La griglia scarica immagini a piena risoluzione | Capi precedenti alla pipeline thumbnail | Backfill thumbnail (come già fatto per gli outfit in `outfit-thumb.ts`) | MEDIUM |
| 5 | Firma URL doppia | Ogni apertura firma sia thumb che originale per tutti i capi (≈ 2× payload) | `resolveWardrobeUrls` firma entrambi | Firmare l'originale solo nel dettaglio | MEDIUM |
| 6 | Home e Stylist ricaricano a ogni ritorno sul tab | Query/fetch ripetute a ogni cambio tab | `refreshKey` / `load()` su `active` con `useEffect` + `supabase` diretto, fuori da React Query | Migrare quelle letture alla cache React Query condivisa (come wardrobe/plans) | MEDIUM |
| 7 | Stylist non in streaming | Attesa "a vuoto" fino a 25 s | `generateText` (no stream) | Streaming della risposta (o almeno stato di digitazione immediato già presente + stream in seguito) | MEDIUM |
| 8 | Google Fonts esterni bloccanti | Ritardo primo render, dipendenza rete | `<link>` CSS a fonts.googleapis.com | Self-host dei 2 font con `preload` | LOW |
| 9 | Splash: delay 0,6 s / 1 s sui contenuti | Solo schermata iniziale non loggata | `animationDelay` in `Splash.tsx` | Ridurre a 0–150 ms | LOW |
| 10 | Sheet apertura 500 ms | Sensazione di lentezza nei bottom sheet | default shadcn `data-[state=open]:duration-500` | 300 ms | LOW |
| 11 | Warning build `outfit-thumb` | Import dinamico inefficace | importato sia staticamente che dinamicamente | Rendere coerente l'import | LOW |

Target proposti: app shell interattiva < 2 s su 4G mid-range; JS iniziale < 250 KB gzip; cambio tab con dati in cache
< 100 ms senza fetch; nessun delay artificiale > 150 ms; feedback AI visibile < 200 ms (stato di caricamento) e testo in streaming.

Non segnalati come problemi (verificati): il polling a 2 s di `OutfitScan` (job esterno FASHN, legittimo), i `setTimeout` da 150 ms sui blur dei campi brand.

---

## F. SECURITY

Verifiche positive (stato attuale, DB di produzione):
- RLS **attiva su tutte le 55 tabelle**; policy scoped su `auth.uid()`; tabelle di configurazione in sola lettura;
  `calendar_connections` / `oauth_pending_connections` senza policy = accessibili solo dal server (token OAuth non leggibili dal client) ✓
- 6 bucket storage tutti **privati**, policy per cartella `{uid}/` ✓
- Tutte le server function usano `requireSupabaseAuth` (JWT verificato con `getClaims`); le query con service role filtrano su `context.userId` (mai uno userId dal client) ✓
- Endpoint worker pubblici protetti da `SCAN_WORKER_SECRET` ✓; guardia SSRF sugli URL utente (`safe-url.ts`) ✓
- Nessuna service role key / secret nel frontend o nella storia git (il `.env` contiene solo la publishable key, pubblica per design) ✓

| Gravità | Problema | Dettaglio | Fix |
|---|---|---|---|
| **HIGH** | Nessun limite server-side sulle API a pagamento | Qualsiasi utente registrato (signup aperto) può chiamare in loop Gemini, FASHN, gpt-image, remove.bg, OpenAI voce, Firecrawl → rischio di costo illimitato | Il sistema quote di questa proposta (enforcement server + tetto giornaliero anti-abuso) |
| **HIGH** | Quota Firecrawl inefficace | `consume_firecrawl_credit` **non esiste nel DB di produzione** → la chiamata fallisce e il codice è *fail-open* (`ok: true`): il limite 10/giorno non viene mai applicato. Inoltre il limite è passato dal chiamante (`p_daily_limit`) | Sostituire con `enforceFeature('url_import')` (limite deciso dal server, fail-closed) |
| MEDIUM | Eliminazione account incompleta | `deleteMyAccount` svuota solo `avatars`, `outfits`, `wardrobe`; restano file in `avatar-private` (foto avatar), `outfit-photos`, `shared-library` | Aggiungere i 3 bucket (requisito GDPR e store) |
| MEDIUM | Stack trace mostrato agli utenti | `ErrorComponent` in `__root.tsx` stampa lo stack ("TEMPORARY diagnostic") | Mostrarlo solo all'owner o in dev |
| MEDIUM | Schermata Storage Debug pubblica | Bottone in `Profile.tsx:433` per tutti | Visibile solo a `role = owner` |
| LOW | Schema DB non riproducibile dal repo | Le migrazioni nel repo creano 24 tabelle, il DB ne ha 55 (create da Lovable fuori repo) | Esportare lo schema corrente in una migrazione baseline |
| LOW | Dipendenze | `npm audit` (risoluzione da registry pubblico, non dal lockfile Lovable): 5 high nella catena `nitro` beta (undici, miniflare, sharp), fix solo con bump major di `nitro` | **Non aggiornare ora**: `nitro` è gestito dal template Lovable; da verificare con loro |
| — | Piano/ruolo | Oggi non esistono → nulla da aggirare. Vincolo di design: mai su `profiles` (vedi D) | — |

---

## G. STORE READINESS

| Area | Stato | Problema | Azione |
|---|---|---|---|
| Stack mobile | **BLOCKER** | Nessun wrapper: niente Capacitor, PWA manifest o service worker. App SSR su Cloudflare con server function a URL relativi | Scelta architetturale (vedi sotto) |
| Linee guida Apple 4.2 (minimum functionality) | NEEDS WORK | Un WebView che carica il sito rischia il rifiuto | Wrapper con funzioni native reali (camera, push, IAP) |
| Pagamenti in-app | **BLOCKER** (per vendere) | Apple e Google richiedono IAP / Play Billing per abbonamenti digitali in-app | Dopo entitlement: RevenueCat o integrazione diretta → `user_subscriptions` |
| Privacy Policy / Termini | **BLOCKER** | Assenti nell'app e nel repo | Redigere, linkare in signup, impostazioni e schede store |
| Consenso | NEEDS WORK | Nessun consenso esplicito al signup; foto avatar inviata a terzi (FASHN), immagini a provider AI | Consenso al signup + informativa sui processori (Lovable AI/Google, OpenAI, FASHN, remove.bg, Firecrawl) |
| Eliminazione account | NEEDS WORK | Esiste in-app ✓ ma non elimina 3 bucket | Fix (vedi F) |
| UGC (community/chat) | NEEDS WORK | Blocco utenti ✓, **manca "segnala"** e moderazione (Apple 1.2) | Segnalazione contenuti/utenti + gestione owner |
| Deep link auth | NEEDS WORK | `APP_URL` web hardcoded per conferma email, reset password e callback OAuth calendario | Universal Links / App Links + redirect configurabili |
| Login | READY | Solo email/password → Sign in with Apple non obbligatorio | Se si aggiunge Google login, serve anche Apple |
| Fotocamera / libreria | NEEDS WORK | Usate via `<input capture>` (AddItem, OutfitScan, Shop, selfie) | Stringhe di permesso iOS (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`) / plugin Camera |
| Microfono | NEEDS WORK | Usato oggi (voce Stylist, `getUserMedia`) | `NSMicrophoneUsageDescription` / `RECORD_AUDIO` |
| Posizione | NEEDS WORK | Usata oggi per il meteo (`use-location.tsx`) | `NSLocationWhenInUseUsageDescription` / location coarse |
| Calendario dispositivo | READY | Sync via OAuth/CalDAV lato server, nessun permesso calendario del device | — |
| Notifiche push | non necessarie oggi | Solo in-app; il push servirà per le proposte meteo (futuro) | Permesso solo quando si aggiunge il push |
| Analytics / tracking | READY | Nessun SDK di analytics/tracking → niente ATT | Dichiararlo nelle schede privacy |
| Build / typecheck / test | READY | `tsc` 0 errori, 117/117 test, build OK | — |
| Lint | NEEDS WORK | 9.880 segnalazioni, di cui 4.674 solo formattazione prettier; reali: 144 `no-explicit-any`, 9 react-refresh, 4 escape inutili, 2 exhaustive-deps, 1 prefer-const | Nessuna è bloccante; pulizia graduale |
| Performance | NEEDS WORK | Vedi E (#1, #2, #3) | — |
| Icone / splash nativi / metadata store | NEEDS WORK | Solo `favicon.ico` | Asset icone, screenshot, descrizioni |

**Opzioni wrapper (da decidere):**
- **A. Capacitor con URL remoto** (`server.url` → sito Lovable): rapido, nessun cambio di build; rischio review Apple 4.2,
  dipendenza totale dalla rete.
- **B. Capacitor con client bundled + server function remote** (consigliata a medio termine): build SPA del client nel
  binario, server function chiamate su origin assoluto (richiede config base URL + CORS + deep link). Più lavoro, migliore review e velocità.
- In entrambi i casi: plugin Camera, Push, IAP (RevenueCat), App/Universal Links.

---

## H. FILE MODIFICATI (questa fase)

| File | Modifica | Motivo |
|---|---|---|
| `docs/audit/2026-10-01-audit-commercial-structure.md` | nuovo | Questo report |

Nessun file di codice, configurazione, dipendenza o DB è stato modificato. Sul DB sono state eseguite solo query SELECT.

## I. TEST ESEGUITI

| Test | Risultato |
|---|---|
| `tsc --noEmit` | ✅ 0 errori |
| `bun test src/lib` | ✅ 117 pass, 0 fail (6 file: trip-capsule, value engine, weather rules, calendar diff, …) |
| `vite build` (produzione) | ✅ OK — warning: chunk > 500 KB, import misto `outfit-thumb` |
| `eslint .` | ⚠️ 9.880 problemi (vedi G), nessun errore di import/file mancanti |
| `npm audit` (prod) | ⚠️ 5 high nella catena nitro beta, 1 low |
| Verifica RLS / bucket / cron sul DB live | ✅ vedi F |
| Flussi E2E (signup, upload, AI…) | ⏸ non eseguiti in questa fase (servono le chiavi del server) — previsti allo STEP 10 |

Nota ambiente: le dipendenze sono state installate dal registry npm pubblico perché il registry privato di Lovable
indicato in `bun.lock` non è raggiungibile da qui; le versioni risolte possono differire leggermente dal lockfile.

## L. COSA RESTA DA FARE (ordine proposto)

1. **Approvazione** di matrice, quote e modello ruolo/piano (questo documento).
2. STEP 9 — migrazione `user_roles` / `user_subscriptions` / `usage_counters` / `subscription_events` + `consume_quota`;
   `catalog.ts`, `enforceFeature`, `getMyEntitlements`, `useEntitlements`, `PaywallSheet`; una riga di enforcement in
   ogni server function AI; gate UI sui punti d'ingresso; owner override + simulazione piano; account test.
3. Fix sicurezza: quota Firecrawl, eliminazione account completa, stack trace e Storage Debug solo owner.
4. STEP 10 — test dei 4 scenari + regressione (auth, onboarding, wardrobe, outfit, stylist, planner, valigia, advisor, armocromia).
5. STEP 11 — performance #1 (lazy screens), #2 (splash), #3 (cascata), poi #4–#7.
6. STEP 12 — typecheck, build, test, lint finale.
7. Prima degli store: Privacy Policy + Termini + consenso; segnalazione UGC; scelta wrapper (A/B) e Capacitor;
   deep link; IAP (RevenueCat); permessi nativi; asset store; baseline schema DB nel repo.
