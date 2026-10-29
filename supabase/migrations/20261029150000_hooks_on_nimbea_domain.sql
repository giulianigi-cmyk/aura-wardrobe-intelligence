-- Scheduled jobs call the app on nimbea.app.
--
-- Why: the four scheduled jobs (pg_cron) call the app's hooks at
-- https://aura-wardrobe-intelligence.lovable.app/…; since 29/10 that address answers 404 (the
-- Lovable project was renamed and nimbea.app is now the primary domain). Every call fails, so no
-- morning look, evening reminder, rain alert or feature-news push is sent, calendars are not synced
-- twice a day, the bulk-scan queue is not drained by the schedule and planned outfits are not
-- rechecked against the weather.
--
-- What: the same four functions, unchanged except for the address (https://nimbea.app, the custom
-- domain, which does not change if the project is renamed again).
--
-- Risks: none on data — no table, policy, schedule or secret changes. If nimbea.app stopped serving
-- the app the calls would fail exactly as they do now.
CREATE OR REPLACE FUNCTION public.drain_scan_jobs_if_needed()
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
    select 1 from public.scan_jobs
    where status = 'queued'
       or (status = 'processing' and claimed_at < now() - interval '5 minutes')
  ) into has_work;

  if not has_work then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'scan_worker_secret';

  if secret is null then
    raise warning '[AURA] scan_worker_secret not found in Vault — cron drain skipped';
    return;
  end if;

  perform net.http_post(
    url := 'https://nimbea.app/api/public/hooks/process-scan-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', secret
    ),
    body := jsonb_build_object('limit', 20)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.recheck_plan_weather_if_needed()
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
    select 1 from public.outfit_plans
    where status = 'planned'
      and date between (current_date - 1) and (current_date + 2)
  ) into has_work;

  if not has_work then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'scan_worker_secret';

  if secret is null then
    raise warning '[AURA] scan_worker_secret not found in Vault — weather recheck skipped';
    return;
  end if;

  perform net.http_post(
    url := 'https://nimbea.app/api/public/hooks/recheck-plan-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', secret
    ),
    body := jsonb_build_object('limit', 200)
  );
end;
$function$;

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
    url := 'https://nimbea.app/api/public/hooks/send-morning-looks',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', secret),
    body := '{}'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_calendars_if_needed()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  secret text;
begin
  if not exists (select 1 from public.calendar_connections) then
    return;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'scan_worker_secret';

  if secret is null then
    raise warning '[AURA] scan_worker_secret not found in Vault — calendar sync skipped';
    return;
  end if;

  perform net.http_post(
    url := 'https://nimbea.app/api/public/hooks/sync-calendars',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$function$;
