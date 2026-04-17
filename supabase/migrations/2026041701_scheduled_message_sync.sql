-- Scheduled reconciliation: call the backfill-missive-inbound Edge Function
-- every 15 minutes to recover any inbound messages that the webhook missed.
-- Uses pg_net to make an async HTTP POST to the Edge Function.
-- The Edge Function writes its result to system_settings.messaging_last_sync
-- so the admin Settings page can display sync health.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Wrap in a SQL function so cron.schedule can call it
CREATE OR REPLACE FUNCTION trigger_message_sync()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  since_ts text;
  func_url text;
  anon_key text;
BEGIN
  since_ts := to_char(now() - interval '20 minutes', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  -- Supabase exposes these via pg settings
  func_url := current_setting('supabase_url', true) || '/functions/v1/backfill-missive-inbound';
  anon_key := current_setting('supabase.anon_key', true);

  -- If settings are not available, fall back to hardcoded project values
  IF func_url IS NULL OR func_url = '' OR anon_key IS NULL OR anon_key = '' THEN
    func_url := 'https://aeiyinpxmazmfubotpdk.supabase.co/functions/v1/backfill-missive-inbound';
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaXlpbnB4bWF6bWZ1Ym90cGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTUwMDgsImV4cCI6MjA4NjIzMTAwOH0.JEKZmh81soWP7xXre9ePGf_0VvOnAuT45Kctmd_I6YY';
  END IF;

  PERFORM net.http_post(
    url := func_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'since', since_ts,
      'write_status', true
    )
  );
END;
$$;

-- Unschedule if exists (safe for re-runs)
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-message-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scheduled-message-sync',
  '*/15 * * * *',
  $$SELECT trigger_message_sync();$$
);
