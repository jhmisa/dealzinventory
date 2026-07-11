-- Content Studio Phase 2: hourly "materialise rule ghosts" cron — SHIPPED DISABLED.
-- Materialising is SAFE (it only creates editable status='scheduled' ghost posts, never
-- publishes), but it ships disabled for control; the app invokes materialize-rules on demand
-- when a rule is created/edited. Enable later to keep the horizon rolling forward:
--   SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname='content-materialize-rules'), active := true);
CREATE OR REPLACE FUNCTION trigger_materialize_rules()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  func_url text;
  anon_key text;
BEGIN
  func_url := current_setting('supabase_url', true) || '/functions/v1/materialize-rules';
  anon_key := current_setting('supabase.anon_key', true);

  IF func_url IS NULL OR func_url = '/functions/v1/materialize-rules' OR anon_key IS NULL OR anon_key = '' THEN
    func_url := 'https://aeiyinpxmazmfubotpdk.supabase.co/functions/v1/materialize-rules';
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

DO $$
DECLARE
  jid bigint;
BEGIN
  jid := cron.schedule('content-materialize-rules', '15 * * * *', $q$SELECT trigger_materialize_rules();$q$);
  PERFORM cron.alter_job(job_id := jid, active := false);
END $$;
