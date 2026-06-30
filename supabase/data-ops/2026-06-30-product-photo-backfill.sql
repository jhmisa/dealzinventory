-- supabase/data-ops/2026-06-30-product-photo-backfill.sql
-- Build a job list of (product_model_id, image_url): one representative model per color_key that
-- (a) matches an iosys_catalog row carrying an image_url and (b) is a genuinely EMPTY color group
--     (no product_media row of ANY role on any model sharing that color_key).
-- The runner (run-product-photo-backfill.ts) reads product_photo_jobs and calls save-product-photos.
-- Idempotent: re-running rebuilds the table and re-excludes color groups that now have any image.
BEGIN;

DROP TABLE IF EXISTS public.product_photo_jobs;

CREATE TABLE public.product_photo_jobs AS
WITH matched AS (
  SELECT
    c.image_url,
    c.color_en, c.color_ja,
    COALESCE(pm_part.id, pm_modelno.id, pm_name.id) AS product_id
  FROM public.iosys_catalog c
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE' AND c.part_number IS NOT NULL AND pm.part_number = c.part_number
    LIMIT 1
  ) pm_part ON true
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND c.part_number IS NULL AND c.model_number IS NOT NULL
      AND pm.model_number = c.model_number
      AND (c.storage_gb IS NULL
           OR NULLIF(regexp_replace(COALESCE(pm.storage_gb,''),'[^0-9]','','g'),'')::int = c.storage_gb)
      AND ( (c.color_en IS NOT NULL AND lower(pm.color) = lower(c.color_en))
            OR (c.color_ja IS NOT NULL AND pm.color_ja = c.color_ja)
            OR c.color_en IS NULL )
    ORDER BY (lower(COALESCE(pm.color,'')) = lower(COALESCE(c.color_en,''))) DESC
    LIMIT 1
  ) pm_modelno ON true
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND lower(pm.model_name) = lower(c.model_name)
      AND (c.storage_gb IS NULL
           OR NULLIF(regexp_replace(COALESCE(pm.storage_gb,''),'[^0-9]','','g'),'')::int = c.storage_gb)
      AND ( (c.color_en IS NOT NULL AND lower(pm.color) = lower(c.color_en))
            OR (c.color_ja IS NOT NULL AND pm.color_ja = c.color_ja) )
    LIMIT 1
  ) pm_name ON true
  WHERE c.image_url IS NOT NULL
),
ranked AS (
  SELECT DISTINCT ON (pm.color_key)
    m.product_id, m.image_url, pm.color_key
  FROM matched m
  JOIN public.product_models pm ON pm.id = m.product_id
  WHERE m.product_id IS NOT NULL
    AND pm.color_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.product_media x
      JOIN public.product_models pmx ON pmx.id = x.product_id
      WHERE pmx.color_key = pm.color_key
    )
  ORDER BY pm.color_key, m.product_id
)
SELECT product_id, image_url FROM ranked;

COMMIT;
