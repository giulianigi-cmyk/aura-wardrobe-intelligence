-- MOTIVO
-- Nella lista dei desideri ogni capo si pianifica in uno di due modi, a scelta della persona:
-- entro una data (target_date, già presente) oppure con una cifra messa da parte ogni mese per quel
-- capo, da cui l'app calcola in che mese ci si arriva. Serve un campo per la cifra mensile del capo.
--
-- COSA FA
-- Aggiunge a public.wishlist_items la colonna monthly_amount numeric NULL, con vincolo > 0.
-- Nessun dato esistente viene toccato (la tabella è nuova).
--
-- RISCHI
-- Minimi: colonna nullable, nessun default, nessun backfill. Le policy RLS esistenti (per riga,
-- auth.uid() = user_id) valgono anche per la nuova colonna; i GRANT sono a livello di tabella.
--
-- CONTROLLO
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'wishlist_items' and column_name = 'monthly_amount';

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS monthly_amount numeric NULL
  CONSTRAINT wishlist_items_monthly_amount_positive CHECK (monthly_amount IS NULL OR monthly_amount > 0);
