-- Revoke direct EXECUTE from authenticated on SECURITY DEFINER functions that are
-- never called directly by clients or by RLS policies (verified against pg_policies).
-- active_participant_count is only called nested inside other SECURITY DEFINER
-- functions (which execute as the function owner), and sync_wardrobe_wear_stats is a
-- trigger function (fires as table owner), so these revocations break nothing.
REVOKE EXECUTE ON FUNCTION public.active_participant_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_wardrobe_wear_stats() FROM authenticated;

-- Pin search_path on the remaining client-callable SECURITY DEFINER functions so
-- they cannot be hijacked via search_path manipulation.
ALTER FUNCTION public.are_friends(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.can_access_share(uuid) SET search_path = public;
ALTER FUNCTION public.can_read_shared_canvas(text) SET search_path = public;
ALTER FUNCTION public.can_send_message(uuid) SET search_path = public;
ALTER FUNCTION public.is_blocked(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.is_participant(uuid) SET search_path = public;
ALTER FUNCTION public.confirm_wear_event(uuid[], date, text, uuid, uuid, jsonb, numeric) SET search_path = public;
ALTER FUNCTION public.correct_wear_event_item(uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.find_visually_similar_items(vector, integer) SET search_path = public;