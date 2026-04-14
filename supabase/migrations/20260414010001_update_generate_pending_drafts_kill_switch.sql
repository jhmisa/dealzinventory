-- Update generate_pending_drafts() to check global AI kill switch
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
  ai_enabled text;
BEGIN
  -- Check global AI kill switch
  SELECT value INTO ai_enabled
  FROM system_settings
  WHERE key = 'ai_messaging_enabled';

  IF ai_enabled IS NULL OR ai_enabled = 'false' THEN
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
