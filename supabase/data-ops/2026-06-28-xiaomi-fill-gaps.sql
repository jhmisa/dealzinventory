-- Phase A-Android (Xiaomi) — fill-gaps promotion.
-- Promote clean Xiaomi SKUs harvested from iosys (iosys_catalog.brand='Xiaomi',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color) per the
-- Android research: model_number (au XIG##, SoftBank A###XM, older POCO 8-digit globals) + carrier are
-- coarse attributes, NOT the identity key, so carrier variants collapse to one product_model.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard). Same generic Android promote shape as Galaxy/Xperia/AQUOS/
-- Pixel; scoped to brand='Xiaomi'. Xiaomi is the first brand whose SIM-free cards carry NO model code
-- (only carrier units do) — the parser's nameConsumeRe handles that; storage/color parsed from the
-- title (storage stored as "<n>GB" text). Specs from the verified Xiaomi reference; 4 models harvested
-- with spec_known=false (flagged, never guessed — Xiaomi 17T Pro screen, Redmi Note 15, POCO M8 RAM,
-- Redmi 15 — backfill when verified).
--
-- LEGACY RECONCILE — *** DEFERRED OPEN DEBT *** (NOT done here). Unlike the small Xperia/AQUOS/Pixel
-- inline reconciles, Xiaomi has ~33 pre-existing phone product_models rows miscategorized as COMPUTER
-- (~125 items) with dirty names ("Poco C71", "Redmi 15 5G", "Redmi 14C", "Mi 10 Lite 5G", …). This is
-- comparable in size to the deferred Samsung-legacy reconcile (42 rows) and warrants its own careful
-- pass (recategorize→ANDROID, canonicalize names "Poco"→"POCO"/strip 5G, enrich specs, normalize
-- storage, MERGE rows that now duplicate the clean harvested SKUs via item re-pointing). Tracked in
-- PROJECT_STATE + the harvest-runbook registry. The clean harvested rows below coexist with the legacy
-- COMPUTER rows (different device_category → the ANDROID partial-unique index does not collide).
-- DELIBERATELY UNTOUCHED (out of scope): Redmi Buds 6 (earbuds), Redmi Pad SE (tablet → Phase C),
-- Smart Band 8 (fitness band), Sound Pocket speakers.

-- Promote harvested Xiaomi SKUs into product_models.
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
    AND brand = 'Xiaomi'
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
    AND pm.device_category = 'ANDROID'
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
      AND pm2.device_category = 'ANDROID'
  )
);

-- Integrity guard (already created by the Galaxy op; IF NOT EXISTS makes this a no-op if present).
CREATE UNIQUE INDEX IF NOT EXISTS product_models_android_sku_uniq
  ON public.product_models (brand, model_name, storage_gb, color)
  WHERE device_category = 'ANDROID' AND status = 'ACTIVE';
