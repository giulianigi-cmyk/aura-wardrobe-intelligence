ALTER TABLE public.wardrobe_items
  ADD COLUMN leg_shape text NULL;

ALTER TABLE public.wardrobe_items
  ADD CONSTRAINT wardrobe_items_leg_shape_check
  CHECK (
    leg_shape IN (
      'skinny', 'slim', 'straight', 'tapered',
      'bootcut', 'flare', 'wide'
    )
  );