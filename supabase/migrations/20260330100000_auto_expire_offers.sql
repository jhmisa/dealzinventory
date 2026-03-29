-- Auto-expire PENDING offers past their expires_at and release RESERVED items
create or replace function expire_pending_offers()
returns void
language plpgsql
security definer
as $$
begin
  -- Release items that were RESERVED by expired offers, then mark offers EXPIRED
  with expired_offers as (
    update offers
    set offer_status = 'EXPIRED', updated_at = now()
    where offer_status = 'PENDING' and expires_at < now()
    returning id
  ),
  items_to_release as (
    select oi.item_id
    from offer_items oi
    join expired_offers eo on eo.id = oi.offer_id
    where oi.item_id is not null
  )
  update items
  set item_status = 'AVAILABLE'
  from items_to_release r
  where items.id = r.item_id
    and items.item_status = 'RESERVED';
end;
$$;

-- Schedule to run every 5 minutes via pg_cron
select cron.schedule(
  'expire-pending-offers',
  '*/5 * * * *',
  $$select expire_pending_offers()$$
);
