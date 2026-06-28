-- Phase 4-Android (Galaxy) — fill-gaps promotion.
-- Promote clean Samsung Galaxy SKUs harvested from iosys (iosys_catalog.device_category='ANDROID')
-- into product_models, keyed on (brand, model_name, storage, color) per the Android research
-- (docs/investigations/android-identifier-conventions.md): model_number + carrier are coarse
-- attributes, NOT the identity key, so carrier variants collapse to one product_model.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard). Does NOT touch the 42 legacy COMPUTER-miscategorized
-- Samsung rows (37 are referenced by 117 live items) — recategorizing / de-duping / re-pointing
-- those is a separate non-destructive reconcile pass (mirrors iPhone Phase 2 vs Phase 3).
--
-- Storage stored as "<n>GB" text (existing convention). Specs (chipset/ram/screen/year/os) come
-- from the harvest's verified Galaxy spec reference; unknown-spec models land with nulls (flagged
-- upstream by spec_known=false), never guessed.

WITH src AS (
  SELECT DISTINCT ON (brand, model_name, storage_gb, coalesce(color_en, color_ja))
    brand,
    model_name,
    storage_gb,
    coalesce(color_en, color_ja) AS color,
    color_ja,
    model_number,
    source_url,
    specs
  FROM public.iosys_catalog
  WHERE device_category = 'ANDROID'
    AND coalesce(color_en, color_ja) IS NOT NULL  -- color is NOT NULL in product_models; skip color-less parses
  ORDER BY
    brand, model_name, storage_gb, coalesce(color_en, color_ja),
    (carrier = 'SIM-Free') DESC NULLS LAST,  -- prefer the SIM-free model_number as representative
    model_number
)
INSERT INTO public.product_models
  (brand, model_name, color, storage_gb, model_number, color_ja, source_url,
   device_category, status, cpu, ram_gb, screen_size, year, os_family)
SELECT
  s.brand,
  s.model_name,
  s.color,
  CASE WHEN s.storage_gb IS NULL THEN NULL ELSE s.storage_gb::text || 'GB' END,
  s.model_number,
  s.color_ja,
  s.source_url,
  'ANDROID',
  'ACTIVE',
  s.specs->>'chipset',
  s.specs->>'ram_gb',
  nullif(s.specs->>'screen_size', '')::numeric,
  nullif(s.specs->>'year', '')::int,
  coalesce(nullif(s.specs->>'os_family', ''), 'Android')
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand = s.brand
    AND pm.model_name = s.model_name
    AND coalesce(pm.storage_gb, '') = coalesce(
          CASE WHEN s.storage_gb IS NULL THEN NULL ELSE s.storage_gb::text || 'GB' END, '')
    AND coalesce(pm.color, '') = coalesce(s.color, '')
);

-- Integrity guard: no duplicate Galaxy/Android SKUs can reappear (storage/color nulls are
-- treated as distinct by the index, which is fine — the promote already collapsed them).
CREATE UNIQUE INDEX IF NOT EXISTS product_models_android_sku_uniq
  ON public.product_models (brand, model_name, storage_gb, color)
  WHERE device_category = 'ANDROID' AND status = 'ACTIVE';
