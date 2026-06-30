-- ZTE family (nubia / RED MAGIC / Libero / Axon) fill-gaps promotion (2026-07-01, NEW BRAND).
-- Promotes clean ZTE SKUs harvested from iosys (iosys_catalog.device_category='ANDROID', brand='ZTE')
-- into product_models, keyed on (brand, model_name, storage, color) per the Android research.
-- ADDITIVE + idempotent (NOT-EXISTS guard). brand normalizes to 'ZTE' via canonical_brands (already
-- present) — the NOT-EXISTS guard still compares lower(brand) defensively (ZTE is all-caps, same
-- precaution as OPPO). Carrier titles omit storage for Libero/Axon/nubia S2 → those land storage NULL
-- (flagged, never guessed); the NX-coded nubia/RED MAGIC carry storage from the title bracket.
WITH src AS (
  SELECT DISTINCT ON (brand, model_name, storage_gb, coalesce(color_en, color_ja))
    brand, model_name, storage_gb, coalesce(color_en, color_ja) AS color,
    color_ja, model_number, source_url, specs
  FROM public.iosys_catalog
  WHERE device_category = 'ANDROID' AND lower(brand) = 'zte'
    AND coalesce(color_en, color_ja) IS NOT NULL
  ORDER BY
    brand, model_name, storage_gb, coalesce(color_en, color_ja),
    (carrier = 'SIM-Free') DESC NULLS LAST, model_number
)
INSERT INTO public.product_models
  (brand, model_name, color, storage_gb, model_number, color_ja, source_url,
   device_category, status, cpu, ram_gb, screen_size, year, os_family)
SELECT
  s.brand, s.model_name, s.color,
  CASE WHEN s.storage_gb IS NULL THEN NULL ELSE s.storage_gb::text || 'GB' END,
  s.model_number, s.color_ja, s.source_url,
  'ANDROID', 'ACTIVE',
  s.specs->>'chipset', s.specs->>'ram_gb',
  nullif(s.specs->>'screen_size', '')::numeric, nullif(s.specs->>'year', '')::int,
  coalesce(nullif(s.specs->>'os_family', ''), 'Android')
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE lower(pm.brand) = lower(s.brand)
    AND pm.model_name = s.model_name
    AND coalesce(pm.storage_gb, '') = coalesce(
          CASE WHEN s.storage_gb IS NULL THEN NULL ELSE s.storage_gb::text || 'GB' END, '')
    AND coalesce(pm.color, '') = coalesce(s.color, '')
    AND pm.device_category = 'ANDROID' AND pm.status = 'ACTIVE'
);

-- Shared partial UNIQUE index (created by the Galaxy op; IF NOT EXISTS makes this a no-op).
CREATE UNIQUE INDEX IF NOT EXISTS product_models_android_sku_uniq
  ON public.product_models (brand, model_name, storage_gb, color)
  WHERE device_category = 'ANDROID' AND status = 'ACTIVE';
