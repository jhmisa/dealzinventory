-- Phase A-Android (Pixel) — fill-gaps promotion.
-- Promote clean Google Pixel SKUs harvested from iosys (iosys_catalog.brand='Google',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color) per the
-- Android research: model_number (Google "G"+4 code) + carrier are coarse attributes, NOT the identity
-- key, so carrier variants collapse to one product_model.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard). Same generic Android promote shape as Galaxy/Xperia/AQUOS;
-- scoped to brand='Google'. Pixel titles carry inline storage on ~99% of cards (only the original
-- Pixel Fold lacked it) → storage coverage is near-complete (storage stored as "<n>GB" text).
-- Specs from the verified Pixel reference; 0 unknown-spec models in this harvest.
--
-- LEGACY RECONCILE (small, inline — 4 phone rows / 4 items, mirroring the Xperia/AQUOS passes). Four
-- pre-existing Pixel phone product_models were miscategorized as COMPUTER with no specs and empty
-- storage: Pixel 4a (Just Black), Pixel 4a 5G (Just Black), Pixel 5a 5G (Mostly Black), Pixel 7a (Sea).
-- We recategorize them to ANDROID + enrich from the verified reference + normalize empty storage to
-- 128GB (all four "a" models shipped a single 128GB JP tier — verified, not guessed). They are already
-- ACTIVE, so no status change. The harvested Pixel 7a Sea/128GB row then dedupes against the reconciled
-- legacy row via the NOT-EXISTS guard.
--
-- DELIBERATELY UNTOUCHED: two `Google` COMPUTER rows are smart speakers (Nest Mini, Home Mini), NOT
-- phones — out of scope for this phone sweep; left as-is (scoping the reconcile to model_name ILIKE
-- '%pixel%' skips them).

-- 1. Recategorize + enrich the legacy Pixel phone rows (specs from the verified reference; 128GB tier).
UPDATE public.product_models pm SET
  device_category = 'ANDROID',
  storage_gb = CASE WHEN coalesce(pm.storage_gb, '') = '' THEN x.storage ELSE pm.storage_gb END,
  cpu = coalesce(nullif(pm.cpu, ''), x.cpu),
  ram_gb = coalesce(nullif(pm.ram_gb, ''), x.ram_gb),
  screen_size = coalesce(pm.screen_size, x.screen_size),
  year = coalesce(pm.year, x.year),
  os_family = coalesce(nullif(pm.os_family, ''), 'Android')
FROM (VALUES
  ('Pixel 4a',    'Snapdragon 730G', '6', 5.81::numeric, 2020, '128GB'),
  ('Pixel 4a 5G', 'Snapdragon 765G', '6', 6.2::numeric,  2020, '128GB'),
  ('Pixel 5a 5G', 'Snapdragon 765G', '6', 6.34::numeric, 2021, '128GB'),
  ('Pixel 7a',    'Google Tensor G2','8', 6.1::numeric,  2023, '128GB')
) AS x(model_name, cpu, ram_gb, screen_size, year, storage)
WHERE pm.device_category = 'COMPUTER'
  AND pm.model_name ILIKE '%pixel%'
  AND pm.model_name = x.model_name;

-- 2. Promote harvested Pixel SKUs into product_models.
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
    AND brand = 'Google'
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
)
-- Don't add a storage-unknown harvested row when a more-specific (non-null storage) ACTIVE row
-- for the same model+color already exists.
AND NOT (
  s.storage_gb IS NULL AND EXISTS (
    SELECT 1 FROM public.product_models pm2
    WHERE pm2.brand = s.brand
      AND pm2.model_name = s.model_name
      AND coalesce(pm2.color, '') = coalesce(s.color, '')
      AND pm2.storage_gb IS NOT NULL AND pm2.storage_gb <> ''
      AND pm2.status = 'ACTIVE'
  )
);

-- Integrity guard (already created by the Galaxy op; IF NOT EXISTS makes this a no-op if present).
CREATE UNIQUE INDEX IF NOT EXISTS product_models_android_sku_uniq
  ON public.product_models (brand, model_name, storage_gb, color)
  WHERE device_category = 'ANDROID' AND status = 'ACTIVE';
