-- Fix: generate_pending_drafts() failed on EVERY cron run with
--   "column reference \"ai_enabled\" is ambiguous"
-- because the local PL/pgSQL variable `ai_enabled` (kill-switch value) shadowed
-- the conversations.ai_enabled column in the pending-count query.
--
-- Result: the AI-draft cron has been erroring every minute, so no AI drafts were
-- ever generated for inbound customer messages despite correct provider/persona/
-- global-switch config.
--
-- Fix: rename the local variable to `global_ai_setting` and qualify the column
-- reference as conversations.ai_enabled.
--
-- Second bug fixed here: the function read the GUCs `app.settings.supabase_url` /
-- `app.settings.service_role_key`, which were never set on this project (the Supabase
-- `postgres` role cannot set `app.settings.*` parameters). So even past the ambiguity
-- error it would RAISE WARNING and return. We now fall back to a hardcoded URL + the
-- public anon key (a valid gateway JWT) exactly like the working trigger_message_sync_fast
-- function. The edge function authenticates to the DB with its own SUPABASE_SERVICE_ROLE_KEY
-- env var, so the anon key here only needs to pass the function gateway's verify_jwt.

CREATE OR REPLACE FUNCTION public.generate_pending_drafts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  pending_count int;
  debounce_seconds int;
  supabase_url text;
  service_key text;
  global_ai_setting text;
BEGIN
  -- Check global AI kill switch
  SELECT value INTO global_ai_setting
  FROM system_settings
  WHERE key = 'ai_messaging_enabled';

  IF global_ai_setting IS NULL OR global_ai_setting = 'false' THEN
    RETURN;
  END IF;

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
    AND conversations.ai_enabled = true;

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

  -- Fallback to hardcoded URL + anon key when GUCs are unset (they are, on this project).
  -- Matches the working trigger_message_sync_fast pattern.
  IF supabase_url IS NULL OR supabase_url = '' OR service_key IS NULL OR service_key = '' THEN
    supabase_url := 'https://aeiyinpxmazmfubotpdk.supabase.co';
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaXlpbnB4bWF6bWZ1Ym90cGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTUwMDgsImV4cCI6MjA4NjIzMTAwOH0.JEKZmh81soWP7xXre9ePGf_0VvOnAuT45Kctmd_I6YY';
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
$function$;
