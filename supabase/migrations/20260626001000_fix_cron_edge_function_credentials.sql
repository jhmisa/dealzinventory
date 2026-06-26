-- Fix two more pg_cron→edge-function trigger functions that silently failed for the
-- same reason as generate_pending_drafts (see 20260626000000): they read the GUCs
-- `app.settings.supabase_url` / `app.settings.service_role_key`, which were never set
-- (the Supabase `postgres` role can't set `app.settings.*`), so they hit
-- `RAISE WARNING ... RETURN` and never called their edge function.
--
--   - process_message_queue  -> /functions/v1/process-message-queue (automated message sends)
--   - check_yamato_tracking  -> /functions/v1/yamato-tracking       (shipment tracking updates)
--
-- Fix: fall back to a hardcoded URL + the public anon key (a valid gateway JWT), exactly
-- like the working trigger_message_sync_fast function. Each edge function authenticates to
-- the DB with its own SUPABASE_SERVICE_ROLE_KEY env var, so the bearer only needs to clear
-- the function gateway's verify_jwt.

CREATE OR REPLACE FUNCTION public.process_message_queue()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  pending_count int;
  supabase_url text;
  service_key text;
BEGIN
  -- Check if there are any pending items before making the HTTP call
  SELECT count(*) INTO pending_count
  FROM automated_message_queue
  WHERE status = 'PENDING' AND scheduled_at <= now();

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

  -- Fallback to hardcoded URL + anon key when GUCs are unset (they are, on this project)
  IF supabase_url IS NULL OR supabase_url = '' OR service_key IS NULL OR service_key = '' THEN
    supabase_url := 'https://aeiyinpxmazmfubotpdk.supabase.co';
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaXlpbnB4bWF6bWZ1Ym90cGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTUwMDgsImV4cCI6MjA4NjIzMTAwOH0.JEKZmh81soWP7xXre9ePGf_0VvOnAuT45Kctmd_I6YY';
  END IF;

  -- Call the Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/process-message-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_yamato_tracking()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  rec record;
  batch jsonb;
  i int;
  supabase_url text;
  service_key text;
begin
  -- Get config
  supabase_url := current_setting('app.settings.supabase_url', true);
  if supabase_url is null or supabase_url = '' then
    supabase_url := current_setting('supabase.url', true);
  end if;

  service_key := current_setting('app.settings.service_role_key', true);
  if service_key is null or service_key = '' then
    service_key := current_setting('supabase.service_role_key', true);
  end if;

  -- Fallback to hardcoded URL + anon key when GUCs are unset (they are, on this project)
  if supabase_url is null or supabase_url = '' or service_key is null or service_key = '' then
    supabase_url := 'https://aeiyinpxmazmfubotpdk.supabase.co';
    service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaXlpbnB4bWF6bWZ1Ym90cGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTUwMDgsImV4cCI6MjA4NjIzMTAwOH0.JEKZmh81soWP7xXre9ePGf_0VvOnAuT45Kctmd_I6YY';
  end if;

  -- Process SHIPPED orders with tracking, not checked in last 14 min, shipped within 14 days
  -- Chunk into batches of 10 (Yamato CGI limit)
  i := 0;
  batch := '[]'::jsonb;

  for rec in
    select id, tracking_number
    from orders
    where order_status = 'SHIPPED'
      and tracking_number is not null
      and (yamato_last_checked_at is null or yamato_last_checked_at < now() - interval '14 minutes')
      and shipped_date > now() - interval '14 days'
    order by yamato_last_checked_at nulls first
    limit 100
  loop
    batch := batch || jsonb_build_array(jsonb_build_object(
      'order_id', rec.id,
      'tracking_number', rec.tracking_number
    ));
    i := i + 1;

    if i >= 10 then
      -- Send batch to Edge Function
      perform net.http_post(
        url := supabase_url || '/functions/v1/yamato-tracking',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object('orders', batch)
      );
      batch := '[]'::jsonb;
      i := 0;
    end if;
  end loop;

  -- Send remaining batch
  if i > 0 then
    perform net.http_post(
      url := supabase_url || '/functions/v1/yamato-tracking',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('orders', batch)
    );
  end if;
end;
$function$;
