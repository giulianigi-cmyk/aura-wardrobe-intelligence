-- Worn events ("Indossati" / My Outfit) could be created and read, but RLS had no UPDATE or
-- DELETE policy: editing an entry's date, removing a piece from it, deleting an entry and linking
-- a scanned outfit to its plan all affected 0 rows without any error. Editing the pieces even
-- added the new ones while the old ones stayed.
-- Same ownership rule as the existing insert/select policies: only the owner's own rows.
DROP POLICY IF EXISTS "update own wardrobe_events" ON public.wardrobe_events;
CREATE POLICY "update own wardrobe_events" ON public.wardrobe_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete own wardrobe_events" ON public.wardrobe_events;
CREATE POLICY "delete own wardrobe_events" ON public.wardrobe_events
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete own wardrobe_event_items" ON public.wardrobe_event_items;
CREATE POLICY "delete own wardrobe_event_items" ON public.wardrobe_event_items
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.wardrobe_events e
    WHERE e.id = wardrobe_event_items.event_id AND e.user_id = auth.uid()
  ));
