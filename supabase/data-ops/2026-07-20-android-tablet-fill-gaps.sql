-- Android-tablet fill-gaps promotion (2026-07-20) — the items/tablet/android MULTI-BRAND path
-- (Samsung Galaxy Tab, Lenovo, NEC LAVIE, Huawei MediaPad, docomo dtab [brand = verified maker],
-- Xiaomi/Redmi Pad, Qua tab, arrows Tab). Follow-up to the Surface session: closes the remaining
-- realistic "No matching product model" gap for Add-Backorder.
--
-- Keyed on (brand, model_name, storage, color) — Android identity; enforced live by
-- uq_active_tablet_sku (brand, model_name, color, storage_gb) WHERE TABLET+ACTIVE. LTE variants
-- carry " LTE" in model_name (set at harvest) so cellular/Wi-Fi twins never collide. Staging
-- filter `part_number IS NULL` separates these from the part#-keyed TABLET rows (iPad, Surface).
--
-- Storage-less cards were enriched at harvest from research-verified single-JP-config models
-- (dtab codes / Qua tab / arrows Tab / MediaPad T3 8 / TAB4 8 Plus / Tab B11 / NEC PC-codes);
-- still-NULL storage promotes as NULL (flagged, never guessed — HTC precedent). Colorless rows
-- are SKIPPED (color NOT NULL). Rows still branded 'dtab' (maker unverified) are HELD in staging.
--
-- ADDITIVE + idempotent (NOT-EXISTS with lower(brand) + coalesce comparisons). INSERT-only:
-- touches no existing rows, no media, no photos.

WITH src AS (
  SELECT DISTINCT ON (brand, model_name, storage_gb, coalesce(color_en, color_ja))
    brand, model_name, storage_gb, coalesce(color_en, color_ja) AS color,
    color_ja, model_number, source_url, specs,
    CASE WHEN storage_gb IS NULL THEN NULL
         WHEN storage_gb >= 1024 AND storage_gb % 1024 = 0 THEN (storage_gb/1024)::text || 'TB'
         ELSE storage_gb::text || 'GB' END AS storage_text
  FROM public.iosys_catalog
  WHERE device_category = 'TABLET'
    AND part_number IS NULL          -- Android tablets only (iPad/Surface are part#-keyed)
    AND lower(brand) <> 'dtab'       -- maker-unresolved dtab rows stay staged, never guessed
    AND coalesce(color_en, color_ja) IS NOT NULL
  ORDER BY
    brand, model_name, storage_gb, coalesce(color_en, color_ja),
    (carrier = 'SIM-Free') DESC NULLS LAST, model_number
)
INSERT INTO public.product_models
  (brand, model_name, color, storage_gb, model_number, color_ja, source_url,
   device_category, status, cpu, ram_gb, screen_size, year, os_family,
   verified_at, has_bluetooth, has_camera)
SELECT
  s.brand, s.model_name, s.color, s.storage_text,
  s.model_number, s.color_ja, s.source_url,
  'TABLET', 'ACTIVE',
  s.specs->>'chipset', s.specs->>'ram_gb',
  nullif(s.specs->>'screen_size', '')::numeric, nullif(s.specs->>'year', '')::int,
  coalesce(nullif(s.specs->>'os_family', ''), 'Android'),
  now(), true, true
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE lower(pm.brand) = lower(s.brand)
    AND pm.model_name = s.model_name
    AND coalesce(pm.storage_gb, '') = coalesce(s.storage_text, '')
    AND coalesce(pm.color, '') = coalesce(s.color, '')
    AND pm.device_category = 'TABLET' AND pm.status = 'ACTIVE'
);
