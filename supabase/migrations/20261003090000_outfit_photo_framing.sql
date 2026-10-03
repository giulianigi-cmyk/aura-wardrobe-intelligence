-- My Outfit: the framing the person chose for their outfit photo (zoom + offset inside the 4:5
-- frame, see src/lib/photo-framing.ts), stored apart from the photo itself (never modified).
-- Nullable, no default: existing rows are untouched and show the whole photo fitted.
-- No new policy needed: "outfit_photo_detections update own" already limits writes to the owner.
ALTER TABLE public.outfit_photo_detections
  ADD COLUMN IF NOT EXISTS photo_framing jsonb;
