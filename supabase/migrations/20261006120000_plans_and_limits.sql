-- Plans (FREE / PLUS / ULTRA / OWNER) and their fair-use limits, observed before they are enforced.
--
-- Why: the paid tiers need to know each person's plan and how much of each limit they have used.
-- Before anyone pays, the limits run in observe-only mode: AURA records when someone WOULD have
-- gone over a limit, without blocking anything, so the numbers can be checked on real use first.
--
-- What (three new tables, nothing existing changes):
--   user_plans                 one row per person who is not on FREE (no row = FREE): plan, end of
--                              the ULTRA trial, where the subscription comes from, time zone used
--                              for daily counters. Written only by the server (service role):
--                              nobody can give themselves a plan through the API.
--   plan_limits                the configurable limits: one row per plan and limit. max_value NULL
--                              = unlimited; enforced = false means observe only. Changing a number
--                              here changes the limit without touching the code. OWNER has no
--                              rows: no limit applies.
--   usage_limit_observations   the first time in a period a person goes over a limit: who, which
--                              limit, how much used. One row per person, limit and period at most.
-- Usage is counted from the existing ai_usage_ledger and wardrobe_items; no new counter table.
--
-- Access: RLS on everywhere. A person reads only their own plan and observations; every signed-in
-- person can read plan_limits (the limits shown in the app are the same for everyone). No insert,
-- update or delete through the API.
--
-- Risks (checked before applying): new tables only; with enforced = false on every row the app
-- behaves exactly as today; at most a few rows per person per month in usage_limit_observations.
-- The OWNER row is NOT in this file (it would put a user id in the repository): it is one INSERT
-- run by hand in the SQL editor.
CREATE TABLE public.user_plans (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'ultra', 'owner')),
  trial_ends_at timestamptz,
  billing_source text CHECK (billing_source IN ('app_store', 'play_store', 'stripe', 'manual')),
  time_zone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_limits (
  plan text NOT NULL CHECK (plan IN ('free', 'plus', 'ultra')),
  limit_key text NOT NULL,
  period text NOT NULL CHECK (period IN ('day', 'month', 'request')),
  max_value numeric(12, 2),
  enforced boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan, limit_key)
);

CREATE TABLE public.usage_limit_observations (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  limit_key text NOT NULL,
  period_start date NOT NULL,
  plan text NOT NULL,
  used numeric(12, 2) NOT NULL,
  max_value numeric(12, 2) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, limit_key, period_start)
);

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_limit_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own plan"
  ON public.user_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Signed-in users read the plan limits"
  ON public.plan_limits FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users read their own limit observations"
  ON public.usage_limit_observations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Starting values approved on 2026-10-05/06 (configurable). 0 = not included in the plan.
-- During the ULTRA trial a FREE person gets the ULTRA limits. Try-On and reconstruction: ULTRA
-- only, plus credits bought apart (a later phase); voice: ULTRA only.
INSERT INTO public.plan_limits (plan, limit_key, period, max_value) VALUES
  ('free',  'new_items',          'day',     10),
  ('plus',  'new_items',          'day',     50),
  ('ultra', 'new_items',          'day',     NULL),
  ('free',  'stylist',            'month',   10),
  ('plus',  'stylist',            'month',   30),
  ('ultra', 'stylist',            'month',   150),
  ('free',  'weekly_plan',        'month',   1),
  ('plus',  'weekly_plan',        'month',   4),
  ('ultra', 'weekly_plan',        'month',   8),
  ('free',  'trip',               'month',   1),
  ('plus',  'trip',               'month',   2),
  ('ultra', 'trip',               'month',   6),
  ('free',  'trip_days',          'request', 3),
  ('plus',  'trip_days',          'request', 7),
  ('ultra', 'trip_days',          'request', NULL),
  ('free',  'outfit_scan',        'month',   3),
  ('plus',  'outfit_scan',        'month',   30),
  ('ultra', 'outfit_scan',        'month',   60),
  ('free',  'gap_analysis',       'month',   1),
  ('plus',  'gap_analysis',       'month',   4),
  ('ultra', 'gap_analysis',       'month',   8),
  ('free',  'advisor',            'month',   3),
  ('plus',  'advisor',            'month',   15),
  ('ultra', 'advisor',            'month',   30),
  ('free',  'daily_look_regen',   'day',     1),
  ('plus',  'daily_look_regen',   'day',     3),
  ('ultra', 'daily_look_regen',   'day',     3),
  ('free',  'tryon',              'month',   0),
  ('plus',  'tryon',              'month',   0),
  ('ultra', 'tryon',              'month',   12),
  ('free',  'reconstruction',     'month',   0),
  ('plus',  'reconstruction',     'month',   0),
  ('ultra', 'reconstruction',     'month',   5),
  ('free',  'voice_minutes',      'month',   0),
  ('plus',  'voice_minutes',      'month',   0),
  ('ultra', 'voice_minutes',      'month',   30),
  ('free',  'voice_replies',      'month',   0),
  ('plus',  'voice_replies',      'month',   0),
  ('ultra', 'voice_replies',      'month',   60),
  ('free',  'cost_cap_eur',       'month',   1),
  ('plus',  'cost_cap_eur',       'month',   3),
  ('ultra', 'cost_cap_eur',       'month',   6);
