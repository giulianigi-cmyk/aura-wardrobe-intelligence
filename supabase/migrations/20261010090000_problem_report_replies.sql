-- "Segnala un problema": reply and "in progress" status, managed in the app (Settings › Manage reports).
--
-- Why: until now a report could only be read by its author and its status changed by hand in the
-- database; the person never got an answer. The owner now replies and moves the status from the app,
-- and the person is notified (in-app + push, written by the server).
--
-- Changes (additive, nothing removed):
--   admin_reply   the reply shown to the person (optional, max 2000 characters)
--   replied_at    when the reply was written
--   updated_at    last change of status or reply by the owner
--   status        also 'in_progress' (values allowed: open, in_progress, fixed, wontfix)
--
-- Risks: low. Existing rows keep their values (new columns are empty, updated_at = now). The status
-- check is replaced by a wider one in the same transaction. No new policy: reads by the person stay
-- limited to their own rows; every write goes through server functions that check ownership or the
-- admin list (AURA_ADMIN_USER_IDS).
BEGIN;

ALTER TABLE public.app_problem_reports
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.app_problem_reports
  DROP CONSTRAINT IF EXISTS app_problem_reports_admin_reply_check;
ALTER TABLE public.app_problem_reports
  ADD CONSTRAINT app_problem_reports_admin_reply_check CHECK (admin_reply IS NULL OR char_length(admin_reply) <= 2000);

ALTER TABLE public.app_problem_reports
  DROP CONSTRAINT IF EXISTS app_problem_reports_status_check;
ALTER TABLE public.app_problem_reports
  ADD CONSTRAINT app_problem_reports_status_check CHECK (status IN ('open', 'in_progress', 'fixed', 'wontfix'));

COMMIT;
