# AURA — Fase 1c: verifica backfill e validazione con account owner

Data: 2026-10-01 · Solo letture. Nessuna modifica a codice, DB o Storage.

## 1. Verifica backfill — esito: NON ESEGUITO

| Controllo | Atteso | Risultato |
|---|---:|---:|
| Owner senza thumbnail prima | 228 | 228 |
| Completate (`thumbnail_path like '%/thumb-backfill-%'`) | 228 | **0** |
| Remaining | 0 | **228** |
| File `thumb-backfill-*` in Storage | 228 | **0** |
| Righe DB senza file | 0 | 0 |
| File senza riga DB | 0 | 0 |
| Duplicati | 0 | 0 |
| Altri utenti toccati / file fuori dalla cartella owner | 0 | 0 / 0 |
| Originali (n / byte / md5) | 228 / 117.047.545 / `fe4d8140…` | **228 / 117.047.545 / `fe4d8140b9ed7166ce922414ce997e53` — invariati** |

### Causa (verificata)

- Il progetto Lovable pubblicato è ancora sul commit **`89af6af`** (`latest_commit_sha` dal connettore) = `main` originale.
- Il codice del backfill (`77a89a5`) e tutte le modifiche della Fase 1 sono **solo sul branch**
  `claude/aura-audit-commercial-structure-dgc74y`: `git merge-base --is-ancestor 77a89a5 origin/main` → falso.
- Il tuo account ha avuto attività di sessione oggi alle **12:56 UTC**, quindi l'app è stata aperta, ma sulla build
  pubblicata, che non contiene il backfill.

Non ho corretto nulla. Per eseguirlo serve che il branch (o almeno il commit del backfill) arrivi su `main` e venga
pubblicato da Lovable: è una tua decisione, perché pubblicherebbe anche tutte le modifiche di performance della Fase 1 e il fix #418.

## 2. Test reale con account owner — NON ESEGUIBILE da questo ambiente

| Ostacolo | Dettaglio |
|---|---|
| Autenticazione | Non ho (e non devo avere) le tue credenziali. Non ho creato sessioni a tuo nome né usato il service role per impersonarti: sarebbe un accesso al tuo account senza il tuo login. |
| Rete | Il dominio pubblicato `aura-wardrobe-intelligence.lovable.app` è bloccato dalla network policy di questo ambiente (curl e WebFetch). |
| Build | Anche potendo entrare, l'app pubblicata è la versione **pre-Fase 1**: le misure non mostrerebbero i miglioramenti fatti. |

Per questo la tabella richiesta non può contenere misure reali:

| Schermata | Cold load | Warm load | Time to usable | Problemi | Priorità |
|---|---:|---:|---:|---|---|
| Home | non misurabile | non misurabile | non misurabile | richiede login | — |
| Wardrobe | non misurabile | non misurabile | non misurabile | richiede login (dati reali sotto) | — |
| My Outfits | non misurabile | non misurabile | non misurabile | richiede login | — |
| Stylist | non misurabile | non misurabile | non misurabile | richiede login | — |
| Planner | non misurabile | non misurabile | non misurabile | richiede login | — |
| Calendar | non misurabile | non misurabile | non misurabile | richiede login | — |
| Valigia | non misurabile | non misurabile | non misurabile | richiede login | — |
| Purchase Advisor | non misurabile | non misurabile | non misurabile | richiede login | — |
| Profile | non misurabile | non misurabile | non misurabile | richiede login | — |

### Dati reali del tuo account (DB, sola lettura)

| Dato | Valore |
|---|---:|
| Capi totali / attivi | **461** / 457 |
| Capi con thumbnail oggi | 233 (228 senza) |
| Peso immagini se la griglia Wardrobe carica tutti i capi (scroll completo), **oggi** | **115,6 MB** (thumbnail dove esiste, originale PNG altrimenti) |
| Stesso dato **dopo il backfill** (stima: 17 KB per le nuove thumbnail) | **≈ 7,6 MB (−93%)** |
| Outfit / outfit senza thumbnail | 84 / 6 |
| Piani | 60 |
| Viaggi | 1 |
| Eventi calendario | 195 |

Lettura: con 461 capi il collo di bottiglia della griglia oggi sono i ~113 MB di originali PNG dei 228 capi senza
thumbnail, non il numero di elementi nel DOM. Se, a backfill fatto, serva anche la virtualizzazione si può dire solo
con una misura reale.

## 3. Come ottenere le misure reali (proposte, nulla implementato)

1. **Pubblicare il branch** (merge su `main` → pubblicazione Lovable). Alla prima apertura con il tuo account parte il
   backfill (da desktop, Wi-Fi, app aperta qualche minuto). Poi rilancio le query di verifica della sezione 1.
2. **Misure fatte da te nel tuo browser**, senza condividere credenziali: Chrome DevTools → Network, con "Disable cache"
   per il cold load e senza per il warm load, poi esporti un **HAR** per schermata (Home, Wardrobe con scroll completo,
   Stylist, Planner, Valigia, Shop, Profilo). Opzionale: Performance → registrazione dello scroll del Wardrobe per FPS e
   jank. Mi mandi i file e li analizzo: richieste duplicate, signed URL, peso immagini, tempi. Attenzione: un HAR contiene
   token di sessione e URL firmati validi un'ora, quindi va condiviso solo dopo il logout o la scadenza.
3. In alternativa, un **account di test** con una copia del guardaroba, solo se e quando vorrai autorizzare la scrittura di dati di test.

## 4. Confronto con la Fase 1

I miglioramenti della Fase 1 (JS iniziale −45%, splash −1,6 s, lazy loading, cache degli URL firmati, refresh silenzioso
di Home/Stylist/Planner, query calendario unica, fix #418) sono misurati sulla build del branch **senza login**. Sull'app
pubblicata **nessuno di questi è ancora attivo**. Sull'account autenticato quindi oggi non c'è nulla di realmente migliorato da misurare.

## PROBLEMI RESIDUI

- **HIGH** — Le modifiche della Fase 1 e il backfill non sono in produzione: senza pubblicazione non hanno effetto.
- **HIGH** — Griglia Wardrobe dell'owner: 228 capi su 461 scaricano l'originale (115,6 MB a scroll completo). Si risolve con il backfill già pronto.
- **MEDIUM** — Le misure autenticate restano da fare (vedi sezione 3).
- I restanti problemi della Fase 1 sono invariati (vedi `2026-10-01-phase1-performance.md`).
