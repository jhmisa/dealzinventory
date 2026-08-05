-- SECURITY (advisor: anon_security_definer_function_executable /
--                    authenticated_security_definer_function_executable, WARN x30)
--
-- 30 SECURITY DEFINER functions in `public` are executable by the `anon` role. SECURITY DEFINER
-- means the body runs with the OWNER's privileges (postgres) and ignores RLS entirely, so an
-- anon-executable SECURITY DEFINER function is a hole straight through every RLS policy.
--
-- Verified live on 2026-08-06 with the public anon key — these are NOT theoretical:
--   POST /rest/v1/rpc/get_awaiting_reply_counts -> 200, returned internal folder UUIDs + counts
--   POST /rest/v1/rpc/debug_list_triggers       -> 200, dumped the trigger/function schema
--
-- Note the ACL on every one of these is `=X/postgres | anon=X | authenticated=X | service_role=X`.
-- The leading `=X` is a grant to PUBLIC, so `REVOKE ... FROM anon` alone would be a no-op —
-- anon would still inherit EXECUTE via PUBLIC. We must revoke from PUBLIC too, then grant back
-- explicitly to the roles that genuinely need it. That is what the DO blocks below do.
--
-- Using regprocedure over pg_proc rather than hand-written signatures so overloads are covered
-- and we don't have to hardcode argument types.

-- ---------------------------------------------------------------------------------------------
-- GROUP A — staff RPCs. Called from src/services/* by the admin app, which authenticates through
-- Supabase Auth => the `authenticated` role. Customers do NOT use Supabase Auth (they use the
-- custom PIN flow and hit the API as `anon`), so `authenticated` here means "logged-in staff".
-- Revoke PUBLIC + anon; keep authenticated + service_role.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        'create_accessory_intake_batch',  -- src/services/intake-receipts.ts
        'create_intake_batch',            -- src/services/intake-receipts.ts
        'debug_list_triggers',            -- src/services/items.ts
        'fulfill_backorder_with_item',    -- src/services/backorders.ts
        'generate_inventory_snapshot',    -- src/services/inventory-snapshots.ts
        'get_awaiting_reply_counts',      -- src/services/message-folders.ts
        'mark_backorder_ordered',         -- src/services/backorders.ts
        'merge_customers',                -- src/services/customers.ts (via use-customers.ts)
        'release_backorder_unit',         -- src/services/orders.ts (staff cancel / remove line)
        'reserve_backorder_unit'          -- src/services/backorders.ts
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- GROUP B — server-only. Invoked by pg_cron (runs as `postgres`, the owner, which always retains
-- EXECUTE) or by edge functions using the service_role key. No browser calls these at all.
-- Revoke PUBLIC + anon + authenticated; keep service_role.
--
-- _hash_pin / _verify_pin are the customer PIN primitives used by the customer-auth edge
-- function. Leaving _verify_pin anon-executable hands out an unthrottled PIN-checking oracle,
-- which is the single worst item in this group for a 6-digit PIN.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        '_hash_pin',                      -- customer-auth edge fn (service_role)
        '_verify_pin',                    -- customer-auth edge fn (service_role)
        'check_yamato_tracking',          -- pg_cron
        'debug_check_product_numeric_fields', -- no caller anywhere; debug leftover
        'expire_pending_offers',          -- pg_cron
        'generate_pending_drafts',        -- pg_cron
        'process_message_queue',          -- pg_cron
        'queue_review_requests',          -- pg_cron
        'run_backorder_availability_sweep', -- pg_cron
        'trigger_materialize_rules',      -- pg_cron
        'trigger_publish_due'             -- pg_cron
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- GROUP C — trigger functions (RETURNS trigger). PostgREST never exposes these as RPC, so they
-- were not actually reachable; this is advisor hygiene. Trigger execution does not re-check
-- EXECUTE at fire time (it is checked when the trigger is created), and the owner keeps EXECUTE
-- regardless, so revoking is safe and the triggers keep firing normally.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
      AND p.proname IN (
        'fanout_product_media',
        'increment_unread_on_customer_message',
        'inherit_color_media',
        'log_conversation_customer_change',
        'log_item_changes',
        'log_order_changes',
        'log_order_item_changes',
        'log_order_item_delete',
        'log_order_item_insert'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
