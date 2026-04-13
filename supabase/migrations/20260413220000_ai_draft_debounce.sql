-- ============================================================
-- AI Draft Debounce: wait for customer to finish typing before
-- generating AI drafts (prevents partial-context responses)
-- ============================================================

-- 1. Add debounce column
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS draft_pending_since timestamptz;

-- Partial index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_conversations_draft_pending
  ON conversations (draft_pending_since)
  WHERE draft_pending_since IS NOT NULL;

-- 2. Configurable delay (default 120 seconds / 2 minutes)
INSERT INTO system_settings (key, value)
VALUES ('ai_draft_debounce_seconds', '120')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- DB function: generate_pending_drafts()
-- Called by pg_cron every minute. If any conversations are ready
-- for AI draft generation, invokes the edge function.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_pending_drafts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_count int;
  debounce_seconds int;
  supabase_url text;
  service_key text;
BEGIN
  -- Read configurable debounce delay
  SELECT COALESCE(value::int, 120) INTO debounce_seconds
  FROM system_settings
  WHERE key = 'ai_draft_debounce_seconds';

  IF debounce_seconds IS NULL THEN
    debounce_seconds := 120;
  END IF;

  -- Check if there are any conversations ready for draft generation
  SELECT count(*) INTO pending_count
  FROM conversations
  WHERE draft_pending_since IS NOT NULL
    AND draft_pending_since <= now() - (debounce_seconds || ' seconds')::interval
    AND ai_enabled = true;

  IF pending_count = 0 THEN
    RETURN;
  END IF;

  -- Get config
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := current_setting('supabase.url', true);
  END IF;

  service_key := current_setting('app.settings.service_role_key', true);
  IF service_key IS NULL OR service_key = '' THEN
    service_key := current_setting('supabase.service_role_key', true);
  END IF;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'generate_pending_drafts: missing supabase_url or service_role_key';
    RETURN;
  END IF;

  -- Call the Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/generate-pending-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('debounce_seconds', debounce_seconds)
  );
END;
$$;

-- ============================================================
-- pg_cron schedule — every 1 minute
-- ============================================================

SELECT cron.schedule(
  'generate-pending-drafts',
  '* * * * *',
  $$SELECT generate_pending_drafts()$$
);
