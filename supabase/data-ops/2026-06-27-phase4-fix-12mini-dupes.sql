-- Phase 4 pre-step — fix "iPhone 12 Mini" (capital M) duplicate rows.  APPLIED to remote 2026-06-27 (3 items re-pointed, 3 dupes archived).
-- Root cause: Phase 2 ENRICH-in-place fixed color/part_number but kept the dirty
-- model_name on rows that had items, so 3 SKUs (128GB RED/Black/Blue) escaped the
-- Mini->mini canonicalization. Their canonical lowercase "iPhone 12 mini" twins
-- already exist (same part_numbers, 0 items). Non-destructive: re-point items to the
-- canonical twin (matched by part_number), then ARCHIVE the dupes with superseded_by.
-- Idempotent: re-running is a no-op once no ACTIVE "iPhone 12 Mini" rows remain.

BEGIN;

CREATE TEMP TABLE mini_fix ON COMMIT DROP AS
SELECT dup.id AS dup_id, keep.id AS keep_id, dup.part_number
FROM public.product_models dup
JOIN public.product_models keep
  ON keep.brand='Apple' AND keep.model_name='iPhone 12 mini'
 AND keep.part_number = dup.part_number
 AND COALESCE(keep.status,'ACTIVE')='ACTIVE'
 AND keep.id <> dup.id
WHERE dup.brand='Apple' AND dup.model_name='iPhone 12 Mini'
  AND COALESCE(dup.status,'ACTIVE')='ACTIVE';

-- 1. Re-point items from each dupe to its canonical twin.
UPDATE public.items i SET product_id = mf.keep_id, updated_at=now()
FROM mini_fix mf WHERE i.product_id = mf.dup_id;

-- 2. Archive the now-empty dupes, linking provenance.
UPDATE public.product_models pm
SET status='ARCHIVED', superseded_by=mf.keep_id, updated_at=now()
FROM mini_fix mf WHERE pm.id = mf.dup_id;

-- Verify: no items left on dupes, no ACTIVE capital-M rows remain.
DO $$
DECLARE leftover int; active_dupes int;
BEGIN
  SELECT count(*) INTO leftover FROM public.items i
    JOIN mini_fix mf ON i.product_id = mf.dup_id;
  SELECT count(*) INTO active_dupes FROM public.product_models
    WHERE brand='Apple' AND model_name='iPhone 12 Mini' AND COALESCE(status,'ACTIVE')='ACTIVE';
  IF leftover <> 0 OR active_dupes <> 0 THEN
    RAISE EXCEPTION 'mini-fix incomplete: % items left, % active dupes', leftover, active_dupes;
  END IF;
END $$;

COMMIT;
