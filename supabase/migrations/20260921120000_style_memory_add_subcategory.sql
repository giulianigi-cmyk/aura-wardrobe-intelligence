-- Add 'subcategory' to the allowed memory types.
-- The aggregator (style-memory-aggregator.server.ts) writes it and the prompt builder reads it,
-- but the original CHECK constraint rejected it.
ALTER TABLE public.user_style_memory
  DROP CONSTRAINT IF EXISTS user_style_memory_memory_type_check;

ALTER TABLE public.user_style_memory
  ADD CONSTRAINT user_style_memory_memory_type_check
  CHECK (memory_type IN (
    'style_archetype','silhouette','color_preferred','color_avoided',
    'material','brand','category','subcategory',
    'combination','avoided_combination','lifestyle_context'
  ));
