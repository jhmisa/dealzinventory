-- Phase B-Apple (desktop Mac: iMac / Mac mini) — fill-gaps promotion.
-- Promote clean desktop Mac (iMac / Mac mini) SKUs harvested from iosys (iosys_catalog.brand='Apple', device_category=
-- 'COMPUTER', model_name IN ('Mac mini','iMac','Mac Studio','Mac Pro')) into product_models. Unlike Android, the Mac config
-- (chip/RAM/SSD/GPU) is read straight from the title bracket — spec_known is always true.
--
-- IDENTITY collapses on CONFIG (model_name, screen_size, chipset, ram, storage, color) — several
-- Apple part#s share one config (e.g. MLXY3J/A and MLY03J/A are both Air 13 M2 Silver 8/512); the
-- part# is the coarse representative (DISTINCT ON picks the J/Japan one first). ADDITIVE + idempotent
-- (NOT-EXISTS guard on the config tuple). Storage formatted GB/TB; os_family='macOS'.
--
-- LEGACY RECONCILE — *** DEFERRED OPEN DEBT *** (NOT done here). ~22 pre-existing MacBook rows carry
-- dirty A-number names ("Macbook A1534", "MacBook Pro 16 A2141"), inconsistent casing, mostly old
-- Intel — they coexist with the clean harvested rows. NO COMPUTER partial-unique index is created yet
-- (the legacy dirty rows would block it); promote the global UNIQUE once COMPUTER is clean (Phase D).

WITH src AS (
  SELECT DISTINCT ON (model_name, specs->>'screen_size', specs->>'chipset', specs->>'ram_gb', storage_gb, coalesce(color_en, color_ja, '—'))
    brand, model_name, storage_gb, coalesce(color_en, color_ja, '—') AS color, color_ja,
    model_number, source_url, specs,
    CASE WHEN storage_gb IS NULL THEN NULL
         WHEN storage_gb >= 1024 AND storage_gb % 1024 = 0 THEN (storage_gb/1024)::text || 'TB'
         ELSE storage_gb::text || 'GB' END AS storage_text
  FROM public.iosys_catalog
  WHERE device_category = 'COMPUTER' AND brand = 'Apple' AND model_name IN ('Mac mini','iMac','Mac Studio','Mac Pro')
  ORDER BY model_name, specs->>'screen_size', specs->>'chipset', specs->>'ram_gb', storage_gb,
           coalesce(color_en, color_ja, '—'),
           (specs->>'region_code' = 'J') DESC NULLS LAST, model_number
)
INSERT INTO public.product_models
  (brand, model_name, color, storage_gb, model_number, color_ja, source_url,
   device_category, status, cpu, ram_gb, screen_size, year, os_family)
SELECT
  s.brand, s.model_name, s.color, s.storage_text, s.model_number, s.color_ja, s.source_url,
  'COMPUTER', 'ACTIVE',
  s.specs->>'chipset',
  s.specs->>'ram_gb',
  nullif(s.specs->>'screen_size', '')::numeric,
  nullif(s.specs->>'year', '')::int,
  'macOS'
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand = 'Apple' AND pm.device_category = 'COMPUTER'
    AND pm.model_name = s.model_name
    AND pm.screen_size IS NOT DISTINCT FROM nullif(s.specs->>'screen_size','')::numeric
    AND coalesce(pm.cpu, '') = coalesce(s.specs->>'chipset', '')
    AND coalesce(pm.ram_gb, '') = coalesce(s.specs->>'ram_gb', '')
    AND coalesce(pm.storage_gb, '') = coalesce(s.storage_text, '')
    AND coalesce(pm.color, '') = coalesce(s.color, '')
);
