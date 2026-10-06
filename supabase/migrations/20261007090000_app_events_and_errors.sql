-- Product usage events, app errors and problem reports, kept in AURA's own database.
--
-- Why: AURA has no usage statistics (where people stop: signing up, first pieces, first outfit…)
-- and no error monitoring (errors in production are only known when someone reports them). Kept
-- here rather than in an external analytics / error service: no new dependency, no data leaves the
-- project, and the same database already holds the consumption ledger to read them alongside.
--
-- What (three new tables, nothing existing changes):
--   app_events   one row per product event: who, which event (a fixed list checked by the server),
--                a few small fields (screen, source, feature, outcome, count), app version, when.
--                No free text, no photo, no item name, no content.
--   app_errors   one row per error seen in the app (crash, failed request, unhandled error): kind,
--                a short message and stack with e-mail addresses, tokens and URL query strings
--                removed, screen, app version, when. Same error repeated in a burst is sent once.
--   app_problem_reports  "Segnala un problema": what the person writes themselves (up to 1000
--                characters), the screen they came from, app version, when, and a status the owner
--                updates (open / fixed / wontfix). The person can read their own reports.
-- Written only by the server (service role), through validated server functions; events and errors
-- are not readable through the API (RLS on, no policies); a person can read their own reports.
-- Read by the owner in the SQL editor and in the daily report.
--
-- Risks (checked before applying): new tables only; the app sends events in small batches after
-- the fact, so a failure never affects a screen; growth of a few hundred rows per active person per
-- month — rows older than 180 days are to be deleted (cleanup query in the report notes).
CREATE TABLE public.app_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid,
  name text NOT NULL,
  screen text,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_version text,
  platform text
);
CREATE INDEX app_events_name_time_idx ON public.app_events (name, created_at);
CREATE INDEX app_events_user_time_idx ON public.app_events (user_id, created_at);

CREATE TABLE public.app_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid,
  kind text NOT NULL,
  message text NOT NULL,
  stack text,
  screen text,
  fingerprint text,
  app_version text,
  platform text
);
CREATE INDEX app_errors_time_idx ON public.app_errors (created_at);
CREATE INDEX app_errors_fingerprint_idx ON public.app_errors (fingerprint, created_at);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_problem_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  screen text,
  app_version text,
  platform text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'wontfix'))
);
CREATE INDEX app_problem_reports_status_time_idx ON public.app_problem_reports (status, created_at);

ALTER TABLE public.app_problem_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own problem reports"
  ON public.app_problem_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
