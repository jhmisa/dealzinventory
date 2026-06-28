-- Phase A-Android (AQUOS) — fill-gaps promotion.
-- Promote clean Sharp AQUOS SKUs harvested from iosys (iosys_catalog.brand='Sharp',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color)
-- per the Android research (docs/investigations/android-identifier-conventions.md): model_number
-- (SH-M##/SH-RM##/SH-##L/SHG##/SHV##/A###SH) + carrier are coarse attributes, NOT the identity key,
-- so carrier variants collapse to one product_model.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard). Reuses the same generic Android promote shape as the
-- Galaxy/Xperia ops; scoped to brand='Sharp'. Storage stored as "<n>GB" text (existing convention);
-- ~92% of carrier AQUOS listings omit storage in the title (single-tier JP carrier units; never
-- decoded from the code) → those land with storage NULL, flagged, never guessed. Specs come from the
-- verified AQUOS reference; 0 unknown-spec models in this harvest.
--
-- LEGACY RECONCILE (small, done inline — 4 rows / 25 items, mirroring the 3-row Xperia pass, unlike
-- the deferred 42-row Samsung pass). Four pre-existing AQUOS sense3 product_models were miscategorized
-- as COMPUTER with inconsistent names ("Aquos Sense3" / "Aquos Sense 3") and no specs:
--   • 2 ACTIVE  — Silver White (1 item), Pink (2 items)
--   • 2 DRAFT   — Black (21 items) + a Black duplicate (1 item)
-- We (1) recategorize all to ANDROID + canonical name "AQUOS sense3" + enrich from the verified sense3
-- reference + normalize empty storage to 64GB (Japan sense3 shipped a single 64GB tier — verified),
-- (2) merge the duplicate Black row into the 21-item canonical row (repoint its 1 item, archive the
-- stub via superseded_by), and (3) promote the canonical Black row to ACTIVE so sense3 Black/Silver
-- White/Pink each have exactly one ACTIVE 64GB row. The fill-gaps INSERT then skips harvested
-- storage-unknown sense3 rows for those colors (the storage-NULL guard), so they aren't duplicated.

-- 1. Recategorize + canonicalize + enrich the legacy AQUOS sense3 rows (specs: SD630 / 4GB / 5.5" / 2019).
UPDATE public.product_models pm SET
  device_category = 'ANDROID',
  model_name = 'AQUOS sense3',
  storage_gb = CASE WHEN coalesce(pm.storage_gb, '') = '' THEN '64GB' ELSE pm.storage_gb END,
  cpu = coalesce(nullif(pm.cpu, ''), 'Snapdragon 630'),
  ram_gb = coalesce(nullif(pm.ram_gb, ''), '4'),
  screen_size = coalesce(pm.screen_size, 5.5),
  year = coalesce(pm.year, 2019),
  os_family = coalesce(nullif(pm.os_family, ''), 'Android')
WHERE pm.device_category = 'COMPUTER'
  AND pm.model_name ILIKE '%aquos%'
  AND pm.model_name ILIKE '%sense%3';

-- 2. Merge the duplicate Black sense3 row (1 item) into the canonical Black row (21 items):
--    repoint its item, then archive the stub recording the supersession.
UPDATE public.items
  SET product_id = 'eda1f352-d2d6-49b5-b543-66e317df1f7b'
  WHERE product_id = '193635b5-e339-4561-bbde-a021cc7ce3ae';
UPDATE public.product_models
  SET status = 'ARCHIVED', superseded_by = 'eda1f352-d2d6-49b5-b543-66e317df1f7b'
  WHERE id = '193635b5-e339-4561-bbde-a021cc7ce3ae';

-- 3. Promote the canonical Black sense3 row (now ANDROID, 64GB) to ACTIVE.
UPDATE public.product_models
  SET status = 'ACTIVE'
  WHERE id = 'eda1f352-d2d6-49b5-b543-66e317df1f7b';

-- 4. Promote harvested AQUOS SKUs into product_models.
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
    AND brand = 'Sharp'
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
-- for the same model+color already exists (e.g. the reconciled legacy 64GB sense3 rows).
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
