-- SECURITY: two internal staging/queue tables were created without RLS (Supabase advisor
-- `rls_disabled_in_public`, flagged 2026-07-06). Because the public `anon` role holds full
-- read/write grants and the anon key ships in the frontend, anyone with the project URL could
-- read/modify/delete their rows via the auto-generated REST API.
--
-- Neither table is accessed by the app frontend — both are populated/consumed only by server-side
-- runner scripts (`run-backorder-harvest.ts`, `run-product-photo-backfill.ts`) using the
-- service_role key, which bypasses RLS entirely. So we:
--   1. enable RLS (deny-by-default for anon/authenticated),
--   2. add a staff-only FOR ALL policy (matches the project convention, e.g. video_assets),
--   3. revoke the public `anon` grants as defense-in-depth (nothing legitimate uses anon here).
-- service_role keeps working throughout (RLS + grants both bypassed for that role).

-- iosys_backorder_candidates — catalog-harvest staging table
ALTER TABLE public.iosys_backorder_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iosys_backorder_candidates_auth_all ON public.iosys_backorder_candidates;
CREATE POLICY iosys_backorder_candidates_auth_all ON public.iosys_backorder_candidates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.iosys_backorder_candidates FROM anon;

-- product_photo_jobs — one-off photo-backfill job queue
ALTER TABLE public.product_photo_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_photo_jobs_auth_all ON public.product_photo_jobs;
CREATE POLICY product_photo_jobs_auth_all ON public.product_photo_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.product_photo_jobs FROM anon;
