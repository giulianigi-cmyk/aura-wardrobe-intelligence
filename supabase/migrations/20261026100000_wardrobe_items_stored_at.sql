-- Cambio armadio: segnare i capi messi via per la stagione (garage, cantina, sottovuoto…).
--
-- MOTIVO
-- Un capo messo via resta di proprietà della persona (conta nelle analisi, il consiglio
-- d'acquisto lo conosce), ma l'app non deve proporlo in nessun look (look del giorno,
-- Stylist, piano settimanale, viaggi, prova avatar) finché non torna nell'armadio.
-- Le colonne esistenti non bastano senza cambiarne il significato:
--   - archived vuol dire venduto/regalato, e ha già una sua vista;
--   - location_id (le "case") vale solo se è impostata una posizione attiva e nei viaggi
--     una posizione si può scegliere come origine; chi non ha posizioni vedrebbe comunque
--     proposti i capi messi via.
-- Serve quindi un'informazione per capo: quando è stato messo via (NULL = è nell'armadio).
--
-- COSA FA
-- Aggiunge a public.wardrobe_items la colonna stored_at timestamptz, facoltativa, senza
-- valore predefinito: tutti i capi esistenti restano NULL, cioè nell'armadio come oggi.
-- Nessun dato viene modificato. Le policy RLS esistenti sulle righe valgono anche per la
-- nuova colonna (ognuno vede e modifica solo i propri capi); i permessi sono a livello di
-- tabella, quindi non serve nessuna GRANT.
--
-- RISCHI
-- - Bassi: colonna nullable senza default, l'aggiunta non riscrive la tabella.
-- - Il nuovo codice legge stored_at in una select esplicita (ripianificazione meteo):
--   va applicata PRIMA di pubblicare la nuova versione dell'app, altrimenti quella
--   lettura fallisce. Il resto del codice tollera la colonna mancante.
--
-- CONTROLLO DOPO L'APPLICAZIONE (deve restituire una riga: stored_at, timestamp with time zone, YES):
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'stored_at';
--
-- RIPRISTINO (solo dopo aver tolto il codice che la usa; perde l'elenco dei capi messi via):
--   ALTER TABLE public.wardrobe_items DROP COLUMN IF EXISTS stored_at;

ALTER TABLE public.wardrobe_items ADD COLUMN IF NOT EXISTS stored_at timestamptz;

COMMENT ON COLUMN public.wardrobe_items.stored_at IS
  'Cambio armadio: quando il capo è stato messo via. NULL = nell''armadio. Un capo messo via non viene proposto.';
