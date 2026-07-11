-- Content Studio: hourly "publish due posts" cron — SHIPPED DISABLED.
-- The publish-due edge fn additionally no-ops unless app_settings.content_publisher_enabled
-- is true, so this is double-gated. Enabling live posting requires BOTH:
--   1) SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='content-publish-due'), active := true);
--   2) UPDATE app_settings SET value = 'true'::jsonb WHERE key = 'content_publisher_enabled';
-- Do neither until Joey approves go-live.

-- pg_cron functions can't read app.settings.* GUCs (postgres role can't set them), so the
-- function URL + anon key are hardcoded (the anon key is the public client key).
CREATE OR REPLACE FUNCTION trigger_publish_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  func_url text;
  anon_key text;
BEGIN
  func_url := current_setting('supabase_url', true) || '/functions/v1/publish-due';
  anon_key := current_setting('supabase.anon_key', true);

  IF func_url IS NULL OR func_url = '/functions/v1/publish-due' OR anon_key IS NULL OR anon_key = '' THEN
    func_url := 'https://aeiyinpxmazmfubotpdk.supabase.co/functions/v1/publish-due';
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaXlpbnB4bWF6bWZ1Ym90cGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTUwMDgsImV4cCI6MjA4NjIzMTAwOH0.JEKZmh81soWP7xXre9ePGf_0VvOnAuT45Kctmd_I6YY';
  END IF;

  PERFORM net.http_post(
    url := func_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule hourly ("due this hour"), then immediately DISABLE the job via the pg_cron API
-- (cron.alter_job — the migration role can't UPDATE cron.job directly).
DO $$
DECLARE
  jid bigint;
BEGIN
  jid := cron.schedule('content-publish-due', '0 * * * *', $q$SELECT trigger_publish_due();$q$);
  PERFORM cron.alter_job(job_id := jid, active := false);
END $$;
