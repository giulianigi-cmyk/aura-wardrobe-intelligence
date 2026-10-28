-- Cesto del bucato e tintoria: segnare i capi che sono da lavare o in tintoria.
--
-- MOTIVO
-- Un capo nel cesto o in tintoria resta della persona ma non è indossabile: l'app non deve
-- proporlo in nessun look (look del giorno, Stylist, piani, viaggi, prova avatar) finché non
-- torna nell'armadio. Le colonne esistenti hanno già un altro significato:
--   - archived = venduto/regalato;
--   - stored_at = messo via per la stagione (mesi);
--   - active_loan_id = prestato a una persona.
-- Servono quindi: da quando il capo è fuori (per il rientro automatico dal cesto dopo 10 giorni e
-- per il promemoria della tintoria dopo 7) e dove si trova (cesto o tintoria).
--
-- COSA FA
-- Aggiunge a public.wardrobe_items due colonne facoltative, senza valore predefinito:
--   - laundry_since timestamptz: da quando il capo è nel cesto o in tintoria (NULL = nell'armadio);
--   - laundry_kind text, 'basket' oppure 'dry_cleaner' (vincolo CHECK).
-- Tutti i capi esistenti restano NULL, cioè nell'armadio come oggi. Nessun dato viene modificato.
-- Le policy RLS esistenti sulle righe valgono anche per le nuove colonne (ognuno vede e modifica
-- solo i propri capi); i permessi sono a livello di tabella, quindi non serve nessuna GRANT.
-- La tabella dei prestiti non cambia: il promemoria "l'hai ripreso?" usa loaned_at e updated_at.
--
-- RISCHI
-- - Bassi: colonne nullable senza default, l'aggiunta non riscrive la tabella.
-- - Va applicata PRIMA di pubblicare la versione dell'app che legge le nuove colonne in select
--   esplicite (ripianificazione meteo, notifica del mattino).
--
-- CONTROLLO DOPO L'APPLICAZIONE (deve restituire due righe, entrambe nullable):
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'wardrobe_items'
--     and column_name in ('laundry_since', 'laundry_kind');

ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS laundry_since timestamptz NULL,
  ADD COLUMN IF NOT EXISTS laundry_kind text NULL;

ALTER TABLE public.wardrobe_items
  ADD CONSTRAINT wardrobe_items_laundry_kind_check
  CHECK (laundry_kind IS NULL OR laundry_kind IN ('basket', 'dry_cleaner'));
