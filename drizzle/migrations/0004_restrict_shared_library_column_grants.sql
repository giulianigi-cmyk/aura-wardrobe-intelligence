REVOKE ALL ON public.shared_library_items FROM anon, authenticated;

GRANT SELECT (
  id, image_url, thumbnail_path, category, subcategory, brand, color, colors, material,
  season, style, occasion, style_tags, size, price, currency, gender, length, sleeve_length,
  fit, heel_height, toe_shape, closure, formality, day_evening, product_id, created_at, updated_at
) ON public.shared_library_items TO authenticated;

GRANT ALL ON public.shared_library_items TO service_role;