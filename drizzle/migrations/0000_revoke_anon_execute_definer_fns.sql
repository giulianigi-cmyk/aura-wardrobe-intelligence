REVOKE EXECUTE ON FUNCTION public.confirm_wear_event(uuid[], date, text, uuid, uuid, jsonb, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.correct_wear_event_item(uuid, uuid, uuid) FROM anon;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;