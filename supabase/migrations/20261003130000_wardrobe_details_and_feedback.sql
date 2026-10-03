-- 1) wardrobe_items.details: construction / finish details found by the photo analysis
--    (slingback, patent, suede, crystals, quilted, chain…) and, for bags, how they can be carried
--    (shoulder, crossbody, handheld). Keys from src/lib/garment-details.ts.
--    NULL = not analysed for details yet (the background completion job picks those up);
--    an empty array = analysed, nothing notable. Nullable, no default: existing rows untouched.
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS details text[];

-- 2) wardrobe_feedback: corrections the person gives to the suggestions, so the engines stop
--    repeating a mistake for them:
--    - 'already_own': "Ce l'ho già" on a wardrobe-gap suggestion or a purchase verdict — the
--      category/subcategory/colours are treated as owned (owned_item_id when they point at one);
--    - 'not_similar': the purchase advisor called a product similar to an owned piece and the
--      person says it isn't (product_key identifies the product).
CREATE TABLE IF NOT EXISTS public.wardrobe_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('already_own', 'not_similar')),
  category text,
  subcategory text,
  colors text[] NOT NULL DEFAULT '{}',
  product_key text,
  owned_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wardrobe_feedback_user_idx ON public.wardrobe_feedback (user_id, kind);

ALTER TABLE public.wardrobe_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select own wardrobe_feedback" ON public.wardrobe_feedback;
CREATE POLICY "select own wardrobe_feedback" ON public.wardrobe_feedback FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert own wardrobe_feedback" ON public.wardrobe_feedback;
CREATE POLICY "insert own wardrobe_feedback" ON public.wardrobe_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete own wardrobe_feedback" ON public.wardrobe_feedback;
CREATE POLICY "delete own wardrobe_feedback" ON public.wardrobe_feedback FOR DELETE USING (auth.uid() = user_id);
