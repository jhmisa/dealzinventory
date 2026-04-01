-- Enable pg_net extension (needed for cron → Edge Function HTTP calls)
create extension if not exists pg_net with schema extensions;

-- Add Yamato tracking columns to orders
alter table orders
  add column if not exists yamato_status text,
  add column if not exists yamato_last_checked_at timestamptz,
  add column if not exists delivery_issue_flag boolean not null default false;

-- Partial index for efficient cron query: SHIPPED orders with tracking numbers
create index if not exists idx_orders_shipped_tracking
  on orders (yamato_last_checked_at)
  where order_status = 'SHIPPED' and tracking_number is not null;

-- PL/pgSQL function to invoke the Edge Function for SHIPPED orders
create or replace function check_yamato_tracking()
returns void
language plpgsql
security definer
as $$
declare
  rec record;
  batch jsonb;
  i int;
  supabase_url text;
  service_key text;
begin
  -- Get config from Vault (fallback to env vars set by Supabase)
  supabase_url := current_setting('app.settings.supabase_url', true);
  if supabase_url is null or supabase_url = '' then
    supabase_url := current_setting('supabase.url', true);
  end if;

  service_key := current_setting('app.settings.service_role_key', true);
  if service_key is null or service_key = '' then
    service_key := current_setting('supabase.service_role_key', true);
  end if;

  -- Bail if we can't find credentials
  if supabase_url is null or service_key is null then
    raise warning 'check_yamato_tracking: missing supabase_url or service_role_key';
    return;
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
$$;

-- Schedule to run every 15 minutes via pg_cron
select cron.schedule(
  'check-yamato-tracking',
  '*/15 * * * *',
  $$select check_yamato_tracking()$$
);
