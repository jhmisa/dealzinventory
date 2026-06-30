-- iPad fill-gaps (re-harvest sweep 2026-07-01). Idempotent (NOT EXISTS guard), additive only.
-- Promotes deduped domestic iosys_catalog TABLET SKUs into ACTIVE product_models.
-- Same PART-1 logic as 2026-06-27-phase4-ipad-reconcile.sql; re-run safe. Picks up new
-- models added to ipad-specs.ts (this pass: iPad Air 11"/13" (M4), 2026, 12GB).

BEGIN;

WITH mapped AS (
  SELECT model_name, color_en, color_ja, storage_gb, part_number, specs, source_url
  FROM public.iosys_catalog
  WHERE device_category='TABLET' AND (specs->>'is_domestic')='true' AND color_en IS NOT NULL
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
  d.specs->>'chipset', (d.specs->>'screen_size')::numeric, (d.specs->>'year')::int,
  d.specs->>'ram_gb', 'iPadOS', 'TABLET', 'ACTIVE', d.source_url, now(), true, true
FROM dedup d
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand='Apple' AND pm.device_category='TABLET' AND pm.status='ACTIVE'
    AND pm.model_name=d.model_name AND pm.color=d.color_en AND pm.storage_gb=d.storage_gb::text||'GB'
);

COMMIT;
