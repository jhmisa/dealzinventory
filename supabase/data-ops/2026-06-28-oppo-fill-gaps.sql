-- Phase A-Android (OPPO) — fill-gaps promotion.
-- Promote clean OPPO SKUs harvested from iosys (iosys_catalog.brand='OPPO',
-- device_category='ANDROID') into product_models, keyed on (brand, model_name, storage, color) per the
-- Android research: model_number (global CPH####, au OPG##, SoftBank/Y!mobile A###OP) + carrier are
-- coarse attributes, NOT the identity key, so carrier variants collapse to one product_model.
--
-- ADDITIVE + idempotent (NOT-EXISTS guard). Same generic Android promote shape as Galaxy/Xperia/AQUOS/
-- Pixel/Xiaomi; scoped to brand='OPPO'. OPPO is a CODED brand (almost every card carries a code); a few
-- old code-less models (AX7) ride the nameConsumeRe path. Two JP grammar quirks handled generically:
-- storage in the name segment before the code (Reno3 A "6GB 128GB CPH2013") and the "…付属" accessory
-- bundle suffix (Find N6 "OPPO AI Pen Kit付属"). Storage stored as "<n>GB" text. Specs from the verified
-- OPPO reference; models harvested with spec_known=false are flagged never guessed (A5 5G, Find N6 5G,
-- Find X8, Find X9 — exact SoC/screen/RAM unconfirmed; backfill when verified).
--
-- LEGACY RECONCILE — *** DEFERRED OPEN DEBT *** (NOT done here). Like the deferred Samsung (42 rows) and
-- Xiaomi (~33 rows) passes, OPPO has ~25 pre-existing phone product_models rows miscategorized as
-- COMPUTER (~110 items) — mostly already clean names ("A5 2020", "Reno13 A", "Reno5 A") plus a few
-- dirty/dup ones ("Reno11 A " trailing space, double "A5 5G"). Warrants its own careful pass
-- (recategorize→ANDROID, dedup, enrich specs, MERGE rows that now duplicate the clean harvested SKUs via
-- item re-pointing). Tracked in PROJECT_STATE + the harvest-runbook registry. The clean harvested rows
-- below coexist with the legacy COMPUTER rows (different device_category → the ANDROID partial-unique
-- index does not collide). Out-of-scope legacy OPPO rows (R15 Pro / R17 Neo / A3 5G / A5x) left as-is.

-- Promote harvested OPPO SKUs into product_models.
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
    AND brand = 'OPPO'
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
