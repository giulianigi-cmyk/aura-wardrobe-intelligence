CREATE OR REPLACE FUNCTION public.purge_shared_library_on_revoke()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.share_wardrobe_to_library, false) = true
     AND COALESCE(NEW.share_wardrobe_to_library, false) = false THEN
    DELETE FROM public.shared_library_items
    WHERE owner_hash = public.shared_library_owner_hash(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_shared_library_on_revoke() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purge_shared_library_on_revoke ON public.profiles;
CREATE TRIGGER trg_purge_shared_library_on_revoke
AFTER UPDATE OF share_wardrobe_to_library ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.purge_shared_library_on_revoke();