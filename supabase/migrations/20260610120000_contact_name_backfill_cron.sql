-- Safety-net cron: resolve missing Facebook contact names.
--
-- Missive resolves a sender's display name asynchronously, a few seconds AFTER
-- it fires our webhook — so the webhook (and its immediate enrichment) often
-- store contact_name = NULL. The webhook now retries with backoff, but messages
-- that arrive via the reconciliation sync (backfill-missive-inbound) never
-- trigger name resolution. This cron sweeps any recently-active conversation
-- that still has no name and resolves it from the Missive API, so "Unknown"
-- contacts self-heal within ~2 minutes regardless of ingestion path.
--
-- Mirrors the trigger_message_sync_fast pattern (pg_cron + pg_net).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION trigger_contact_name_backfill()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  since_ts text;
  func_url text;
  anon_key text;
BEGIN
  -- Only sweep conversations active in the last 2 hours to keep each run cheap.
  since_ts := to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  func_url := current_setting('supabase_url', true) || '/functions/v1/backfill-contact-names';
  anon_key := current_setting('supabase.anon_key', true);

  IF func_url IS NULL OR func_url = '' OR anon_key IS NULL OR anon_key = '' THEN
    func_url := 'https://aeiyinpxmazmfubotpdk.supabase.co/functions/v1/backfill-contact-names';
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
      'limit', 100
    )
  );
END;
$$;

-- Unschedule if exists (safe for re-runs)
DO $$
BEGIN
  PERFORM cron.unschedule('contact-name-backfill');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Every 2 minutes (offset off :00 to avoid colliding with the 5-min message sync)
SELECT cron.schedule(
  'contact-name-backfill',
  '*/2 * * * *',
  $$SELECT trigger_contact_name_backfill();$$
);
