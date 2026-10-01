# AURA — Fase 1b: backfill thumbnail (owner) + fix React #418

Branch `claude/aura-audit-commercial-structure-dgc74y`. Punto di riferimento prima delle modifiche: `8e28549`.
Commit: `cf201c9` (fix #418), `77a89a5` (backfill thumbnail).

## THUMBNAIL

### Controllo pre-esecuzione (SELECT, DB di produzione)

| Controllo | Risultato |
|---|---|
| Capi senza thumbnail, tutti gli utenti | 257 |
| **Di cui del tuo account owner** (`32ff3367-afb3-4229-9960-cdcb882961cd`) | **228** |
| Di altri 3 utenti (esclusi, come richiesto) | 29 |
| Owner: originale presente in Storage | 228 / 228 |
| Owner: thumbnail già presente | 0 |
| File `thumb-backfill-*` già esistenti | 0 |
| Owner: originali sopra 8 MB | 1 |
| Trigger su UPDATE di `wardrobe_items` | nessuno (`updated_at` non cambia → i look di Home non vengono rigenerati) |
| Impronta degli originali owner | 228 file, 117.047.545 B, md5 `fe4d8140b9ed7166ce922414ce997e53` (nome + eTag + size + updated_at) |

Il numero target è **228**, non 257: 257 era il totale di tutti gli utenti, mentre l'autorizzazione limita il backfill al
solo account owner.

### Implementazione (opzione A, come autorizzata)

`src/lib/wardrobe-thumb-backfill.ts`, avviato da `AuraApp.tsx` 8 s dopo il login, in background, **solo** se l'utente
loggato è l'owner:

- **Selezione:** batch da 12 con `user_id = owner AND thumbnail_path IS NULL AND image_url IS NOT NULL`.
- **Originale:** URL firmato e **solo download**.
- **Generazione:** `compressImageForUpload(file, 400, 0.75)`, la stessa funzione delle thumbnail attuali. Se non produce un JPEG il capo viene saltato: non si carica mai l'originale come "thumbnail".
- **Upload:** su `{user_id}/thumb-backfill-{item_id}.jpg`, con `upsert` **solo** su quel percorso deterministico.
- **Update:** `thumbnail_path` solo `WHERE id = … AND user_id = … AND thumbnail_path IS NULL`.
- **Cosa non fa:** nessuna cancellazione, nessuna scrittura sugli originali, nessun uso dei 102 orfani.
- **Errori:** un capo fallito viene saltato per il resto della sessione e ritentato all'avvio successivo, senza duplicati.
- **Dispositivi touch:** gli originali > 8 MB vengono lasciati a un'esecuzione da desktop (1 capo).
- **Fine:** il guardaroba viene aggiornato (invalidazione della cache) solo se è stato scritto qualcosa.

### Esecuzione: NON ancora avvenuta

L'opzione A gira **nel tuo browser con la tua sessione**: da questo ambiente non ho (e non devo avere) le tue credenziali.
Stato verificato ora sul DB: owner senza thumbnail **228**, file `thumb-backfill-*` **0**, righe aggiornate **0**.

Si eseguirà la prima volta che apri AURA con il tuo account **su una build che contiene questo branch**. Consigliato:
da desktop su Wi-Fi, lasciando l'app aperta qualche minuto (circa 112 MB da scaricare, 19 batch).

| Voce | Valore |
|---|---|
| 257 iniziali | 257 in totale, **228** nel perimetro autorizzato (owner) |
| Completati | 0 (esecuzione in attesa della tua apertura dell'app) |
| Fallimenti | — |
| Retry | — |
| Storage verificato | stato iniziale verificato (0 file di backfill) |
| DB verificato | stato iniziale verificato (228 da fare) |
| Originali preservati | impronta salvata, da confrontare dopo l'esecuzione |
| Duplicati creati | no (nessuna scrittura ancora; il design li impedisce, vedi test) |

Comportamento verificato con 9 test automatici (DB e Storage simulati in memoria):
- nessun effetto su account diversi dall'owner;
- completamento a batch;
- nessun tocco a thumbnail esistenti o a righe di altri;
- originali mai scritti;
- **ripresa dopo interruzione senza file duplicati**;
- un capo in errore non blocca gli altri;
- una thumbnail creata dall'utente nel frattempo viene mantenuta;
- nessun upload se il generatore non produce un JPEG;
- salto dei file molto grandi su touch.

### Query di verifica post-esecuzione (da lanciare dopo che avrai aperto l'app)

```sql
-- completati, ancora da fare, file reali, righe con file mancante, duplicati
select
  (select count(*) from wardrobe_items where user_id='32ff3367-afb3-4229-9960-cdcb882961cd'
      and thumbnail_path like '%/thumb-backfill-%') completed,
  (select count(*) from wardrobe_items where user_id='32ff3367-afb3-4229-9960-cdcb882961cd'
      and thumbnail_path is null) remaining,
  (select count(*) from storage.objects where bucket_id='wardrobe' and name like '%/thumb-backfill-%') files,
  (select count(*) from wardrobe_items w where w.thumbnail_path like '%/thumb-backfill-%'
      and not exists (select 1 from storage.objects o where o.bucket_id='wardrobe' and o.name=w.thumbnail_path)) rows_missing_file,
  (select count(*) - count(distinct name) from storage.objects where bucket_id='wardrobe' and name like '%/thumb-backfill-%') duplicates,
  (select count(*) from wardrobe_items where user_id<>'32ff3367-afb3-4229-9960-cdcb882961cd'
      and thumbnail_path like '%/thumb-backfill-%') other_users_touched;

-- originali invariati: deve tornare 228 / 117047545 / fe4d8140b9ed7166ce922414ce997e53
select count(*), sum((o.metadata->>'size')::bigint),
  md5(string_agg(o.name||'|'||coalesce(o.metadata->>'eTag','')||'|'||coalesce(o.metadata->>'size','')||'|'||o.updated_at::text, ',' order by o.name))
from storage.objects o
where o.bucket_id='wardrobe' and o.name in (
  select image_url from wardrobe_items where user_id='32ff3367-afb3-4229-9960-cdcb882961cd'
  and (thumbnail_path is null or thumbnail_path like '%/thumb-backfill-%'));
```

## REACT #418

| Voce | Risultato |
|---|---|
| Errore #418 prima | presente a **ogni avvio** per gli utenti con lingua salvata non inglese (verificato su it e fr, build originale e Fase 1) |
| Errore #418 dopo | **0** (build di produzione e build di sviluppo con React non minificato) |
| Lingue testate | default (nessuna lingua salvata), en, it, es, fr: primo avvio + reload, testo nella lingua corretta |
| LanguagePicker | inglese → francese dalla registrazione → reload: francese mantenuto, 0 errori; inglese → spagnolo: ok |
| Schermata lazy (reset password) | ok |
| Ritorno allo Splash | nel codice non esiste nessun percorso che riporti allo Splash dopo l'uscita: nulla da verificare |
| Regressioni trovate | nessuna |

Causa residua emersa durante il test: dopo il primo intervento il #418 restava per it/es/fr. Lo `Splash` era dentro il
`<Suspense>` delle schermate lazy (aggiunto in Fase 1), e React idrata il contenuto di un Suspense **dopo** il resto
dell'albero, cioè dopo il cambio lingua. Splash, Onboarding e Auth, che non sono lazy, ora stanno fuori dal Suspense: con questo l'errore è sparito.

**Non verificabile qui (richiede login):**
- cambio lingua da Impostazioni, login, logout. Dall'analisi del codice non cambiano: `SettingsLanguage` e la sincronizzazione con `profile.language` in Home chiamano `i18n.changeLanguage` dopo il mount, come prima;
- login e logout non toccano la lingua.

File modificati:
- `src/i18n/config.ts`: prima lingua sempre `"en"`; `storedLanguage()` e `applyStoredLanguage()`; preload del chunk della lingua salvata.
- `src/components/aura/AuraApp.tsx`: `useEffect` che applica la lingua salvata dopo l'idratazione; Splash, Onboarding e Auth fuori dal `Suspense`.

Nessun cookie, nessuna istanza i18n per richiesta, rendering lato server invariato.

## ONNX

**Nessuna modifica necessaria.** Nessuna libreria, versione, configurazione Cloudflare o caricamento WASM è stato
toccato. Stato attuale con il lockfile del progetto: due `.wasm` da 22,48 MiB e 22,81 MiB, entrambi sotto il limite di
25 MiB e caricati solo su richiesta. L'unica verifica futura riguarda il deployment Lovable reale.

## TEST

| Test | Risultato |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ 0 errori |
| Test suite (`bun test src/lib`) | ✅ 132/132 (123 precedenti + 9 nuovi del backfill) |
| Production build | ✅ (resta solo il warning preesistente "chunk > 500 KB") |
| Caricamento di tutti i chunk lazy (40, incluso il nuovo `wardrobe-thumb-backfill`) | ✅ 0 errori |
| JS iniziale | 1.208.856 B / 359.846 B gzip (invariato: il backfill è un chunk separato) |
| Lint sui file toccati (escluso prettier) | ✅ nessuna segnalazione |
| Errori residui | nessuno |

Non modificati: FREE/PLUS/ULTRA, trial, paywall, subscription, pagamenti, community/social, schema DB, privacy/terms,
prompt AI, account owner (a parte il backfill autorizzato, non ancora eseguito).
