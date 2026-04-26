-- Replace single 15-min sync with 2-tier schedule:
-- Fast tier: every 5 min, 1-hour lookback, 50 conversations
-- Full tier: every 6 hours, 48-hour lookback, all conversations

-- Drop the old single-schedule job
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-message-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop old function
DROP FUNCTION IF EXISTS trigger_message_sync();

-- Fast tier: every 5 min, 1-hour lookback, batch of 50
CREATE OR REPLACE FUNCTION trigger_message_sync_fast()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  since_ts text;
  func_url text;
  anon_key text;
BEGIN
  since_ts := to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  func_url := current_setting('supabase_url', true) || '/functions/v1/backfill-missive-inbound';
  anon_key := current_setting('supabase.anon_key', true);

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
      'batch_size', 50,
      'tier', 'fast',
      'write_status', true
    )
  );
END;
$$;

-- Full tier: every 6 hours, 48-hour lookback, all conversations
CREATE OR REPLACE FUNCTION trigger_message_sync_full()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  since_ts text;
  func_url text;
  anon_key text;
BEGIN
  since_ts := to_char(now() - interval '48 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  func_url := current_setting('supabase_url', true) || '/functions/v1/backfill-missive-inbound';
  anon_key := current_setting('supabase.anon_key', true);

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
      'batch_size', 500,
      'tier', 'full',
      'write_status', true
    )
  );
END;
$$;

-- Schedule fast tier: every 5 minutes
SELECT cron.schedule(
  'message-sync-fast',
  '*/5 * * * *',
  $$SELECT trigger_message_sync_fast();$$
);

-- Schedule full tier: every 6 hours (at :30 to avoid overlap with fast)
SELECT cron.schedule(
  'message-sync-full',
  '30 */6 * * *',
  $$SELECT trigger_message_sync_full();$$
);
