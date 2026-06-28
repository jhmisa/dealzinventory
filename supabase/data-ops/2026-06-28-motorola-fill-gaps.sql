-- Phase A-Android (Motorola — moto g / edge / razr) — fill-gaps promotion.
-- Promote clean Motorola SKUs harvested from iosys (iosys_catalog.brand='Motorola',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color).
-- Codes: global XT####-#; SoftBank A###MO; docomo M-##[A-Z]. model_number + carrier are coarse.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard, lower(brand) for safety). Names lowercase ("moto g52j 5G",
-- "edge 20", "razr 40"); razr/edge spaced before the number, KEEPS 5G. Specs from the verified
-- Motorola reference — 18 core models fully spec'd; 7 additional carrier/recent models (edge 50/50s
-- pro, edge 30 Pro, moto g64 5G, razr 60d/60s, razr 50 Ultra) harvest as spec_known=false (flagged,
-- never guessed — research did not fully spec them; backfill later). 3 uncertain colors left null.
--
-- LEGACY RECONCILE — *** DEFERRED OPEN DEBT *** (NOT done here). ~3 pre-existing Motorola COMPUTER
-- rows (tiny). Tracked in PROJECT_STATE + the runbook registry.
-- Promote harvested Motorola SKUs into product_models.
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
    AND brand = 'Motorola'
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
  WHERE lower(pm.brand) = lower(s.brand)
    AND pm.model_name = s.model_name
    AND coalesce(pm.storage_gb, '') = coalesce(
          CASE WHEN s.storage_gb IS NULL THEN NULL ELSE s.storage_gb::text || 'GB' END, '')
    AND coalesce(pm.color, '') = coalesce(s.color, '')
    AND pm.device_category = 'ANDROID'
)
-- Don't add a storage-unknown harvested row when a more-specific (non-null storage) ACTIVE row
-- for the same model+color already exists.
AND NOT (
  s.storage_gb IS NULL AND EXISTS (
    SELECT 1 FROM public.product_models pm2
    WHERE lower(pm2.brand) = lower(s.brand)
      AND pm2.model_name = s.model_name
      AND coalesce(pm2.color, '') = coalesce(s.color, '')
      AND pm2.storage_gb IS NOT NULL AND pm2.storage_gb <> ''
      AND pm2.status = 'ACTIVE'
      AND pm2.device_category = 'ANDROID'
  )
);

-- Integrity guard (already created by the Galaxy op; IF NOT EXISTS makes this a no-op if present).
CREATE UNIQUE INDEX IF NOT EXISTS product_models_android_sku_uniq
  ON public.product_models (brand, model_name, storage_gb, color)
  WHERE device_category = 'ANDROID' AND status = 'ACTIVE';
