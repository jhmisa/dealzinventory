-- SECURITY (advisor: rls_disabled_in_public, ERROR) — REGRESSION RE-FIX.
--
-- `public.product_photo_jobs` was already secured on 2026-07-09 by migration
-- 20260709040000_rls_internal_staging_tables.sql (RLS + staff policy + REVOKE anon).
-- That migration IS recorded as applied on the remote project, and its sibling table
-- `iosys_backorder_candidates` is still correctly locked down (anon gets 42501).
--
-- But `supabase/data-ops/2026-06-30-product-photo-backfill.sql` does:
--     DROP TABLE IF EXISTS public.product_photo_jobs;
--     CREATE TABLE public.product_photo_jobs AS ...
-- Re-running that data-op after 2026-07-09 dropped the table together with its RLS flag and
-- its policy, and the recreated table silently re-inherited anon/authenticated grants from the
-- ALTER DEFAULT PRIVILEGES rule in 20260528000000_explicit_public_grants.sql.
--
-- Verified live on 2026-08-06 with the public anon key (the one that ships in the browser bundle):
--   GET    /rest/v1/product_photo_jobs            -> 200 + rows
--   PATCH  /rest/v1/product_photo_jobs?<no-match> -> 204   (UPDATE granted)
--   DELETE /rest/v1/product_photo_jobs?<no-match> -> 200   (DELETE granted)
-- i.e. anyone on the internet could read, corrupt or wipe this table.
--
-- Nothing in the frontend reads this table. Its only consumer is the server-side runner
-- supabase/functions/_shared/catalog/run-product-photo-backfill.ts, which uses the
-- service_role key — service_role bypasses both RLS and grants, so it is unaffected.
--
-- WHAT BREAKS: nothing. anon loses access it never legitimately used; staff (authenticated)
-- retain full access via the policy below; service_role is unaffected.

ALTER TABLE public.product_photo_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_photo_jobs_auth_all ON public.product_photo_jobs;
CREATE POLICY product_photo_jobs_auth_all ON public.product_photo_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.product_photo_jobs FROM anon;
