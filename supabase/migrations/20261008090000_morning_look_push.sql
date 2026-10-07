-- Morning look notification and evening reminder of tomorrow's appointments: pushes at the times
-- each person chooses (Settings › Notifiche).
--
-- Why: AURA has no way to reach people outside the app, so nothing brings them back each morning.
-- The person's choice (on/off and time) is stored in the existing profiles.notification_preferences
-- (no change there); what is new is where each device's push subscription lives, a log so a
-- person gets one notification a day, AURA's own push key, and the 15-minute schedule.
--
-- What (three new tables, one function, one schedule; nothing existing changes):
--   push_subscriptions  one row per device that allowed notifications: the push service address and
--                       the device's public keys (needed to encrypt the message for it). No content.
--                       Written by the server only; a person can read and delete their own.
--   push_send_log       (person, kind, local date) of each notification sent: one a day at most,
--                       even if two runs overlap.
--   push_vapid_keys     one row: AURA's VAPID key pair, created by the server the first time it is
--                       needed; the private key is stored sealed (AES-GCM with the server secret
--                       CALENDAR_ENCRYPTION_KEY), never readable through the API.
--   send_morning_looks_if_needed()  every 15 minutes, if anyone has the notification on and a
--                       device subscribed, calls /api/public/hooks/send-morning-looks with the
--                       worker secret from Vault (same pattern as recheck_plan_weather_if_needed).
--
-- Risks (checked before applying): new tables only, all with RLS on; rows are removed with the
-- account (ON DELETE CASCADE); the schedule does nothing (no HTTP call) while nobody has turned the
-- notification on; no AI cost — the messages only carry the day's temperatures (Open-Meteo) or the
-- titles and times of tomorrow's appointments already in calendar_events_cache.
CREATE TABLE public.push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete their own push subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.push_send_log (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  local_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, local_date)
);
ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_vapid_keys (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key text NOT NULL,
  private_key_sealed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_vapid_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.send_morning_looks_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  has_work boolean;
  secret text;
begin
  select exists (
    select 1 from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where (p.notification_preferences ->> 'morning_look') = 'true'
       or (p.notification_preferences ->> 'event_reminder') = 'true'
  ) into has_work;

  if not has_work then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'scan_worker_secret';

  if secret is null then
    raise warning '[AURA] scan_worker_secret not found in Vault — scheduled notifications skipped';
    return;
  end if;

  perform net.http_post(
    url := 'https://aura-wardrobe-intelligence.lovable.app/api/public/hooks/send-morning-looks',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', secret),
    body := '{}'::jsonb
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_morning_looks_if_needed() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('send-morning-looks', '*/15 * * * *', $$ select public.send_morning_looks_if_needed(); $$);
