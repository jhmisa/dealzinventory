-- Microsoft Surface fill-gaps promotion (2026-07-20) — the FIRST non-Apple part#-keyed shape,
-- and the second config-in-title shape after Mac. Trigger: Joey's Add-Backorder repro — the
-- Surface Go2 STV-00012 iosys listing had no product_model to map to ("No matching product
-- model"), because Microsoft was never harvested.
--
-- IDENTITY collapses on (model_name, color, storage) — the uq_active_tablet_sku index enforces
-- that tuple for TABLET, so Microsoft's channel twins (consumer STV / education STZ / commercial
-- RRX share one hardware config) promote as ONE row whose representative part# prefers the
-- consumer (Win Home) SKU. LTE models carry " LTE Advanced" in model_name (set at harvest —
-- Microsoft's own marketing name), so cellular vs Wi-Fi twins never collide. model_number =
-- part_number (same as Mac), which the Add-Backorder dialog's part#/model# exact paths key on;
-- twin part#s that lost the DISTINCT ON still match via the name+storage+color fallback path.
--
-- device_category: TABLET for the items/tablet/windows path (Go/Pro/Book), COMPUTER for the
-- Surface Laptop path. Config (cpu/ram/storage/os) read verbatim from the title bracket;
-- screen_size/year enriched from surface-specs.ts. Colorless Go-line cards were colored from the
-- research-verified part#→color reference at harvest; any card still color-less here is SKIPPED
-- (color is NOT NULL; never guessed).
--
-- ADDITIVE + idempotent (NOT-EXISTS on brand+part_number). Re-run safe after any re-harvest.

BEGIN;

WITH src AS (
  SELECT DISTINCT ON (s.device_category, s.model_name, coalesce(s.color_en, s.color_ja), s.storage_gb)
    s.brand, s.model_name, coalesce(s.color_en, s.color_ja) AS color, s.color_ja,
    s.part_number, s.model_number, s.source_url, s.device_category, s.specs,
    s.storage_gb,
    CASE WHEN s.storage_gb IS NULL THEN NULL
         WHEN s.storage_gb >= 1024 AND s.storage_gb % 1024 = 0 THEN (s.storage_gb/1024)::text || 'TB'
         ELSE s.storage_gb::text || 'GB' END AS storage_text
  FROM public.iosys_catalog s
  WHERE s.brand = 'Microsoft'
    AND s.part_number IS NOT NULL
    AND coalesce(s.color_en, s.color_ja) IS NOT NULL
  -- Channel-twin representative: prefer the consumer SKU (Windows Home), then the most-listed,
  -- then the lowest part# for determinism.
  ORDER BY s.device_category, s.model_name, coalesce(s.color_en, s.color_ja), s.storage_gb,
           (s.specs->>'os' ILIKE '%home%') DESC, s.listing_count DESC, s.part_number
)
INSERT INTO public.product_models
  (brand, model_name, color, color_ja, storage_gb, part_number, model_number,
   cpu, ram_gb, screen_size, year, os_family, device_category, status,
   source_url, verified_at, has_bluetooth, has_camera)
SELECT
  s.brand, s.model_name, s.color, s.color_ja, s.storage_text, s.part_number, s.model_number,
  trim(concat(s.specs->>'chipset',
              CASE WHEN nullif(s.specs->>'cpu_ghz','') IS NOT NULL
                   THEN ' (' || (s.specs->>'cpu_ghz') || 'GHz)' ELSE '' END)),
  s.specs->>'ram_gb',
  nullif(s.specs->>'screen_size', '')::numeric,
  nullif(s.specs->>'year', '')::int,
  'Windows', s.device_category::device_category, 'ACTIVE',
  s.source_url, now(), true, true
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE lower(pm.brand) = lower(s.brand) AND pm.part_number = s.part_number
)
-- Second guard on the TABLET identity tuple: a re-harvest that surfaces a NEW channel twin of an
-- already-promoted config must skip it, not trip uq_active_tablet_sku.
AND NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE lower(pm.brand) = lower(s.brand) AND pm.device_category = s.device_category::device_category
    AND pm.status = 'ACTIVE'
    AND pm.model_name = s.model_name
    AND coalesce(pm.color, '') = coalesce(s.color, '')
    AND coalesce(pm.storage_gb, '') = coalesce(s.storage_text, '')
);

COMMIT;
