-- Phase A-Android (Xperia) — fill-gaps promotion.
-- Promote clean Sony Xperia SKUs harvested from iosys (iosys_catalog.brand='Sony',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color)
-- per the Android research (docs/investigations/android-identifier-conventions.md): model_number
-- (XQ-/SO-/SOG/SOV/xxxSO/J####) + carrier are coarse attributes, NOT the identity key, so carrier
-- variants collapse to one product_model.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard). Reuses the same generic Android promote shape as the
-- Galaxy op; scoped to brand='Sony' to keep this pass focused. Storage stored as "<n>GB" text
-- (existing convention); ~75% of carrier Xperia listings omit storage in the title (single-tier JP
-- carrier units; never decoded from the code) → those land with storage NULL, flagged, never guessed.
-- Specs (chipset/ram/screen/year/os) come from the verified Xperia spec reference; 0 unknown-spec
-- models in this harvest.
--
-- LEGACY RECONCILE (small, done inline — only 3 rows / 5 items, unlike the deferred 42-row Samsung
-- pass): 3 pre-existing Sony Xperia product_models were miscategorized as COMPUTER and lacked specs.
-- We recategorize them to ANDROID + enrich from the verified reference + normalize the one empty
-- storage to 64GB (Japan Xperia 8 / Ace II shipped a single 64GB tier — verified, not guessed). The
-- 5 items keep pointing at the same product_models rows (no re-pointing needed). The fill-gaps INSERT
-- below then skips harvested storage-unknown rows when a more-specific (non-null storage) ACTIVE row
-- for the same (brand, model_name, color) already exists, so the reconciled rows aren't duplicated.

UPDATE public.product_models pm SET
  device_category = 'ANDROID',
  storage_gb = CASE WHEN coalesce(pm.storage_gb, '') = '' THEN '64GB' ELSE pm.storage_gb END,
  cpu = coalesce(pm.cpu, x.cpu),
  ram_gb = coalesce(pm.ram_gb, x.ram_gb),
  screen_size = coalesce(pm.screen_size, x.screen_size),
  year = coalesce(pm.year, x.year),
  os_family = coalesce(nullif(pm.os_family, ''), 'Android')
FROM (VALUES
  ('Xperia 8',     'Snapdragon 630', '4', 6.0::numeric, 2019),
  ('Xperia Ace II', 'Helio P35',     '4', 5.5::numeric, 2021)
) AS x(model_name, cpu, ram_gb, screen_size, year)
WHERE pm.brand = 'Sony'
  AND pm.model_name = x.model_name
  AND pm.device_category = 'COMPUTER';

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
    AND brand = 'Sony'
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
-- for the same model+color already exists (e.g. the reconciled legacy 64GB Xperia 8 / Ace II rows).
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
