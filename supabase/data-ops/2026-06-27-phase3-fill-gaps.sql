-- Phase 3 fill-gaps — APPLIED to remote 2026-06-27. Idempotent (NOT EXISTS guard), additive only.
-- Promotes deduped domestic iosys_catalog SKUs into ACTIVE product_models (searchable).

BEGIN;

WITH mapped AS (
  SELECT
    CASE WHEN model_name='iPhone SE' AND model_number='A2296' THEN 'iPhone SE (2nd generation)'
         WHEN model_name='iPhone SE' AND model_number IN ('A2782','A2595','A2783') THEN 'iPhone SE (3rd generation)'
         ELSE model_name END AS model_name,
    color_en, color_ja, storage_gb, part_number, specs, source_url
  FROM public.iosys_catalog
  WHERE (specs->>'is_domestic')='true' AND color_en IS NOT NULL
),
dedup AS (
  SELECT DISTINCT ON (model_name, color_en, storage_gb)
    model_name, color_en, color_ja, storage_gb, part_number, specs, source_url
  FROM mapped
  ORDER BY model_name, color_en, storage_gb, (part_number LIKE 'M%') DESC, part_number
)
INSERT INTO public.product_models
  (brand, model_name, color, color_ja, storage_gb, part_number,
   chipset, screen_size, year, ram_gb, os_family, device_category, status,
   source_url, verified_at, has_bluetooth, has_camera)
SELECT 'Apple', d.model_name, d.color_en, d.color_ja, d.storage_gb::text||'GB', d.part_number,
  -- specs: from iosys reference; SE filled from known values; newest models left null (flagged)
  COALESCE(d.specs->>'chipset',
    CASE d.model_name WHEN 'iPhone SE (2nd generation)' THEN 'A13 Bionic'
                      WHEN 'iPhone SE (3rd generation)' THEN 'A15 Bionic' END),
  COALESCE((d.specs->>'screen_size')::numeric,
    CASE WHEN d.model_name LIKE 'iPhone SE %' THEN 4.7 END),
  COALESCE((d.specs->>'year')::int,
    CASE d.model_name WHEN 'iPhone SE (2nd generation)' THEN 2020
                      WHEN 'iPhone SE (3rd generation)' THEN 2022 END),
  COALESCE(d.specs->>'ram_gb',
    CASE d.model_name WHEN 'iPhone SE (2nd generation)' THEN '3'
                      WHEN 'iPhone SE (3rd generation)' THEN '4' END),
  'iOS', 'IPHONE', 'ACTIVE', d.source_url, now(), true, true
FROM dedup d
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand='Apple' AND pm.device_category='IPHONE' AND pm.status='ACTIVE'
    AND pm.model_name=d.model_name AND pm.color=d.color_en AND pm.storage_gb=d.storage_gb::text||'GB'
);

COMMIT;
