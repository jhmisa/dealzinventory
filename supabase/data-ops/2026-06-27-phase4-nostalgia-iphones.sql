-- Phase 4 — "nostalgia" old iPhones (owner-requested). APPLIED to remote 2026-06-27 (43 SKUs).
-- iPhone 5s / 6 / 6 Plus / SE (1st generation) are rarely on iosys now, so we insert them
-- directly from Apple's documented color x storage configs + the verified spec reference.
-- part_number NULL (not harvested). Idempotent NOT EXISTS guard; uq_active_iphone_sku also
-- protects against dupes. device_category=IPHONE, ACTIVE -> searchable for kaitori.

BEGIN;

WITH spec(model_name, chipset, screen_size, year, ram_gb) AS (VALUES
  ('iPhone 5s',                    'A7', 4.0, 2013, '1'),
  ('iPhone 6',                     'A8', 4.7, 2014, '1'),
  ('iPhone 6 Plus',                'A8', 5.5, 2014, '1'),
  ('iPhone SE (1st generation)',   'A9', 4.0, 2016, '2')
),
-- color (EN + JA) per model
col(model_name, color, color_ja) AS (VALUES
  ('iPhone 5s','Space Gray','スペースグレイ'), ('iPhone 5s','Silver','シルバー'), ('iPhone 5s','Gold','ゴールド'),
  ('iPhone 6','Space Gray','スペースグレイ'), ('iPhone 6','Silver','シルバー'), ('iPhone 6','Gold','ゴールド'),
  ('iPhone 6 Plus','Space Gray','スペースグレイ'), ('iPhone 6 Plus','Silver','シルバー'), ('iPhone 6 Plus','Gold','ゴールド'),
  ('iPhone SE (1st generation)','Space Gray','スペースグレイ'), ('iPhone SE (1st generation)','Silver','シルバー'),
  ('iPhone SE (1st generation)','Gold','ゴールド'), ('iPhone SE (1st generation)','Rose Gold','ローズゴールド')
),
-- storage tiers per model
stor(model_name, gb) AS (VALUES
  ('iPhone 5s',16),('iPhone 5s',32),('iPhone 5s',64),
  ('iPhone 6',16),('iPhone 6',64),('iPhone 6',128),
  ('iPhone 6 Plus',16),('iPhone 6 Plus',64),('iPhone 6 Plus',128),
  ('iPhone SE (1st generation)',16),('iPhone SE (1st generation)',32),
  ('iPhone SE (1st generation)',64),('iPhone SE (1st generation)',128)
),
sku AS (
  SELECT s.model_name, c.color, c.color_ja, st.gb, s.chipset, s.screen_size, s.year, s.ram_gb
  FROM spec s JOIN col c USING (model_name) JOIN stor st USING (model_name)
)
INSERT INTO public.product_models
  (brand, model_name, color, color_ja, storage_gb, chipset, screen_size, year, ram_gb,
   os_family, device_category, status, verified_at, has_bluetooth, has_camera)
SELECT 'Apple', k.model_name, k.color, k.color_ja, k.gb::text||'GB', k.chipset, k.screen_size,
  k.year, k.ram_gb, 'iOS', 'IPHONE', 'ACTIVE', now(), true, true
FROM sku k
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand='Apple' AND pm.device_category='IPHONE' AND pm.status='ACTIVE'
    AND pm.model_name=k.model_name AND pm.color=k.color AND pm.storage_gb=k.gb::text||'GB');

COMMIT;
