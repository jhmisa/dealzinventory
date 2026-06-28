-- Phase A-Android (HUAWEI) — fill-gaps promotion.
-- Promote clean HUAWEI SKUs harvested from iosys (iosys_catalog.brand='Huawei',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color).
-- HUAWEI is a coded brand: global 3-letter "ABC-XYn[J]" (J = Japan SIM-free), au HWV##, docomo
-- HW-##[A-Z]. model_number + carrier are coarse attributes (carrier variants collapse to one row).
--
-- ADDITIVE + idempotent (NOT-EXISTS guard, lower(brand) for safety). Specs from the verified HUAWEI
-- reference (P/Mate/nova lines, Kirin SoCs); 0 unknown-spec models / 0 unmapped colors in this harvest.
-- KEEPS "5G" in the name (P40 Pro 5G). honor is a SEPARATE iosys brand — excluded from the parser, so
-- no honor rows land here.
--
-- LEGACY RECONCILE — *** DEFERRED OPEN DEBT *** (NOT done here). ~8 pre-existing Huawei rows are
-- miscategorized COMPUTER (small). Their own scoped reconcile (recategorize→ANDROID, canonicalize,
-- enrich, merge dups) is tracked in PROJECT_STATE + the runbook registry.

-- Promote harvested HUAWEI SKUs into product_models.
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
    AND brand = 'Huawei'
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
