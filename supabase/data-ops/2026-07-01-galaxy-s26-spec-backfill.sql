-- Galaxy S26 family spec backfill (2026-07-01). The S26/S26+/S26 Ultra rows were promoted in a
-- prior run BEFORE galaxy-specs.ts carried them, so they landed spec-less (cpu/year null) or with a
-- stale messy S26 Ultra cpu string + wrong year (2025). The additive fill-gaps NOT-EXISTS guard
-- can't touch existing rows, so backfill the verified JP specs here (Snapdragon 8 Elite Gen 5 for
-- Galaxy; 12GB; 2026; 6.3/6.7/6.9"). Verified 2026-07-01 (Wikipedia + SamMobile).
BEGIN;

UPDATE public.product_models SET
  cpu = 'Snapdragon 8 Elite Gen 5 for Galaxy', ram_gb = '12', screen_size = 6.3, year = 2026,
  os_family = 'Android'
WHERE brand='Samsung' AND device_category='ANDROID' AND status='ACTIVE' AND model_name='Galaxy S26';

UPDATE public.product_models SET
  cpu = 'Snapdragon 8 Elite Gen 5 for Galaxy', ram_gb = '12', screen_size = 6.7, year = 2026,
  os_family = 'Android'
WHERE brand='Samsung' AND device_category='ANDROID' AND status='ACTIVE' AND model_name='Galaxy S26+';

UPDATE public.product_models SET
  cpu = 'Snapdragon 8 Elite Gen 5 for Galaxy', ram_gb = '12', screen_size = 6.9, year = 2026,
  os_family = 'Android'
WHERE brand='Samsung' AND device_category='ANDROID' AND status='ACTIVE' AND model_name='Galaxy S26 Ultra';

COMMIT;
