-- Libreria condivisa: nessun utente deve poter risalire a chi appartiene una foto.
--
-- MOTIVO
-- La tabella shared_library_items contiene tre colonne che servono solo alla
-- sincronizzazione lato server (service role) e che collegano una riga alla persona:
--   - owner_hash        uguale per tutti i capi della stessa persona (li raggruppa);
--   - source_item_id    id del capo nell'armadio di origine;
--   - source_image_path percorso della foto originale, che contiene lo user_id.
-- Oggi anon e authenticated hanno privilegi completi a livello di tabella
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE…). Per questo la REVOKE sulla sola colonna
-- source_image_path (migrazione 20260813133026) non ha effetto: il privilegio
-- sulla tabella intera la scavalca. RLS limita le righe, non le colonne.
-- Un utente collegato può quindi leggere queste colonne chiamando direttamente l'API.
--
-- COSA FA
-- 1. Toglie ad anon e authenticated ogni privilegio sulla tabella.
-- 2. Ridà ad authenticated solo SELECT sulle colonne del prodotto (immagini, marca,
--    categoria, colori…), escludendo owner_hash, source_item_id e source_image_path.
-- 3. Non tocca service_role (la sincronizzazione continua a leggere e scrivere tutto),
--    le policy RLS, lo storage e i dati.
--
-- RISCHI
-- - Una query di authenticated che chieda una colonna esclusa, o select('*'), riceve
--   "permission denied". Il codice dell'app legge solo le colonne concesse
--   (SHARED_COLUMNS in src/lib/shared-library.functions.ts); le scritture e le letture
--   delle colonne escluse avvengono solo con il service role (shared-library.server.ts).
-- - Una colonna aggiunta in futuro non sarà leggibile finché non le si dà la GRANT.
-- - anon perde l'accesso: oggi non lo usa (la policy RLS è solo per authenticated).
--
-- CONTROLLO DOPO L'APPLICAZIONE (deve restituire solo righe di authenticated con SELECT,
-- e nessuna delle tre colonne escluse):
--   select grantee, privilege_type, column_name
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'shared_library_items'
--     and grantee in ('anon', 'authenticated')
--   order by grantee, column_name;
--
-- RIPRISTINO (torna allo stato precedente):
--   GRANT ALL ON public.shared_library_items TO anon, authenticated;

REVOKE ALL ON public.shared_library_items FROM anon, authenticated;

GRANT SELECT (
  id, image_url, thumbnail_path, category, subcategory, brand, color, colors, material,
  season, style, occasion, style_tags, size, price, currency, gender, length, sleeve_length,
  fit, heel_height, toe_shape, closure, formality, day_evening, product_id, created_at, updated_at
) ON public.shared_library_items TO authenticated;

GRANT ALL ON public.shared_library_items TO service_role;
