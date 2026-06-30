-- Nothing legacy COMPUTER reconcile (2026-07-01, inline with the new-brand harvest).
-- ONE pre-existing row was miscategorized as COMPUTER with a dirty brand/name:
--   brand='Nothing Phone', model_name='(2A)', White, 128GB, device_category='COMPUTER' (1 item).
-- This is the canonical "Nothing / Phone (2a) / White / 128GB". The current iosys harvest carries
-- Phone (2a) only in Black/Milk (no White twin), so there is NOTHING to merge into — we clean the
-- row IN PLACE: recategorize COMPUTER->ANDROID, fix brand+model_name, enrich Phone (2a) specs
-- (research-verified, see nothing-specs.ts), keep its White/128GB identity and its linked item.
-- Idempotent: the WHERE clause only matches the dirty pre-reconcile shape.
UPDATE public.product_models
SET brand = 'Nothing',                 -- normalize_brand() maps 'nothing' -> 'Nothing'
    model_name = 'Phone (2a)',
    device_category = 'ANDROID',
    os_family = 'Android',
    cpu = COALESCE(NULLIF(cpu, ''), 'MediaTek Dimensity 7200 Pro'),
    ram_gb = COALESCE(NULLIF(ram_gb, ''), '8'),
    screen_size = COALESCE(screen_size, 6.7),
    year = COALESCE(year, 2024)
WHERE id = '28c34e44-a8b1-4935-8bf0-637999e42d28'
  AND brand = 'Nothing Phone' AND model_name = '(2A)'
  AND device_category = 'COMPUTER';
