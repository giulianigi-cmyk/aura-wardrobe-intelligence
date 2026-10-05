-- Daily Firecrawl limit per person, actually enforced.
--
-- Why: import-url.functions.ts calls the RPC consume_firecrawl_credit(p_daily_limit) before every
-- Firecrawl scrape (URL import, purchase advisor from a link), but the function was never created.
-- The RPC fails, and the code lets the scrape through when it fails, so the 10-per-day limit was
-- never applied: Firecrawl usage was unlimited for every account.
--
-- What: a counter per person and UTC day, and the function the code already calls. It counts the
-- credit only while the person is under the limit, in one statement (no race between two imports),
-- and returns (allowed, remaining) exactly as the code reads it. Only the signed-in person's own
-- counter is touched (auth.uid()); the table has RLS on and no policies, so nobody reads or writes
-- it directly — only through the function.
--
-- Risks (checked before applying): new table and function only, nothing existing changes; the day
-- is UTC (profiles have no time zone), so the counter resets at 01:00/02:00 Italian time; someone
-- importing from sites that block direct fetching (always Firecrawl) gets the existing "limit
-- reached" message after 10 scrapes in a day, as the code always intended.
CREATE TABLE public.firecrawl_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.firecrawl_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_firecrawl_credit(p_daily_limit integer)
RETURNS TABLE (allowed boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'UTC')::date;
  new_used integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_daily_limit IS NULL OR p_daily_limit < 1 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO public.firecrawl_daily_usage AS u (user_id, day, used)
  VALUES (uid, today, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET used = u.used + 1
  WHERE u.used < p_daily_limit
  RETURNING u.used INTO new_used;

  IF new_used IS NULL THEN
    RETURN QUERY SELECT false, 0;
  ELSE
    RETURN QUERY SELECT true, greatest(p_daily_limit - new_used, 0);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_firecrawl_credit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_firecrawl_credit(integer) TO authenticated;
