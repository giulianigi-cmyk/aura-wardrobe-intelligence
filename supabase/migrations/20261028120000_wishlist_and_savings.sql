-- Lista dei desideri e salvadanaio.
--
-- MOTIVO
-- La persona tiene una lista ordinata dei capi che vorrebbe comprare (con priorità e, se vuole, la
-- data entro cui comprarli) e un salvadanaio: l'app calcola quanto mettere da parte ogni mese per
-- arrivarci, chiede ogni mese se è stato fatto, e propone di aggiungere il ricavato di un capo
-- venduto o la cifra di un acquisto a cui ha rinunciato. Non sono capi posseduti, quindi non vanno in
-- wardrobe_items (finirebbero nei look, nelle statistiche e nel valore del guardaroba). Nessun
-- movimento di denaro reale: sono solo promemoria.
--
-- COSA FA
-- Crea due tabelle, ognuna con RLS attiva e le stesse regole di wardrobe_items (ognuno vede, crea,
-- modifica e cancella solo le proprie righe):
--   - public.wishlist_items: il capo desiderato (foto nello stesso archivio delle foto dei capi,
--     cartella dell'utente), brand, tipo, colori, materiali, prezzo e valuta, link, priorità,
--     target_date (entro quando comprarlo), bought_at (quando comprato);
--   - public.savings_entries: i movimenti del salvadanaio (importo, valuta, data, origine:
--     monthly / sold / skipped / manual / spent, nota facoltativa, capo collegato facoltativo).
-- Nessuna tabella esistente viene modificata.
--
-- RISCHI
-- - Privacy: le policy RLS sono l'unica protezione. Vanno verificate dopo l'applicazione (sotto).
-- - Va applicata prima di pubblicare la versione dell'app che usa le tabelle.
--
-- CONTROLLO DOPO L'APPLICAZIONE
--   select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('wishlist_items','savings_entries');  -- rowsecurity = true
--   select tablename, cmd, qual, with_check from pg_policies where tablename in ('wishlist_items','savings_entries');  -- 4 policy per tabella, tutte su auth.uid() = user_id

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NULL,
  brand text NULL,
  category text NULL,
  subcategory text NULL,
  colors text[] NOT NULL DEFAULT '{}',
  material text[] NOT NULL DEFAULT '{}',
  occasion text NULL,
  formality integer NULL,
  price numeric NULL,
  currency text NULL,
  product_url text NULL,
  title text NULL,
  priority integer NOT NULL DEFAULT 0,
  target_date date NULL,
  bought_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wishlist_items_user_idx ON public.wishlist_items (user_id, priority);

CREATE TABLE IF NOT EXISTS public.savings_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  entry_date date NOT NULL DEFAULT current_date,
  source text NOT NULL CHECK (source IN ('monthly', 'sold', 'skipped', 'manual', 'spent')),
  note text NULL,
  wishlist_item_id uuid NULL REFERENCES public.wishlist_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS savings_entries_user_idx ON public.savings_entries (user_id, entry_date);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own wishlist items" ON public.wishlist_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wishlist items" ON public.wishlist_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wishlist items" ON public.wishlist_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own wishlist items" ON public.wishlist_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can select own savings entries" ON public.savings_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own savings entries" ON public.savings_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own savings entries" ON public.savings_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own savings entries" ON public.savings_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_entries TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;
GRANT ALL ON public.savings_entries TO service_role;
