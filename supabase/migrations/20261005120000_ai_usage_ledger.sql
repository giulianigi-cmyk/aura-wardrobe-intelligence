-- AI / paid-API consumption ledger.
--
-- Why: AURA has no record of what each AI or paid API call actually consumes, so the cost per user
-- (and per FREE / PLUS / ULTRA usage) can only be estimated. Before the plans and their fair use are
-- fixed, every paid call is logged here with its real consumption and an estimated cost.
--
-- What: one row per paid provider call (Gemini / GPT-Image through the Lovable gateway, FASHN,
-- remove.bg, Firecrawl, OpenAI Whisper / TTS), written only by the server (service role).
--   feature           which AURA feature the call served (stylist, daily_look, tryon, …)
--   user_request_id   groups every internal call made for ONE user action (a Stylist request with
--                     its retries is one user request, several rows)
--   tokens / units    the provider's own reported consumption (tokens, images, credits, seconds,
--                     characters, scrapes)
--   cost_usd_estimate the consumption times the list price in price_version (an estimate: the
--                     Lovable gateway's own rates are not published)
--   success, attempt, cached (true = served from AURA's own cache, no provider cost)
-- Only numbers: no prompt, image, answer, URL or any other content is stored.
--
-- Access: RLS on; a person can read only their own rows; nobody can insert, update or delete
-- through the API — the server writes with the service role, which bypasses RLS.
--
-- Risks (checked before applying): new table only, no existing table or function changes; one
-- extra insert per paid call (the app never waits on it failing: errors are swallowed); growth of
-- roughly 50–100 rows per active user per month — aggregate or prune rows older than 12 months later.
CREATE TABLE public.ai_usage_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  feature text NOT NULL,
  user_request_id uuid,
  provider text NOT NULL,
  model text,
  operation text,
  input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  cached_input_tokens integer,
  units numeric(12, 3),
  unit_type text,
  cost_usd_estimate numeric(12, 6),
  price_version text,
  provider_request_id text,
  success boolean NOT NULL,
  attempt smallint NOT NULL DEFAULT 1,
  cached boolean NOT NULL DEFAULT false,
  duration_ms integer
);

-- The same provider job is counted once even if its status is read twice (FASHN polling).
CREATE UNIQUE INDEX ai_usage_ledger_provider_request_uniq
  ON public.ai_usage_ledger (provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE INDEX ai_usage_ledger_user_time_idx ON public.ai_usage_ledger (user_id, created_at);
CREATE INDEX ai_usage_ledger_feature_time_idx ON public.ai_usage_ledger (feature, created_at);

ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own AI usage"
  ON public.ai_usage_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
