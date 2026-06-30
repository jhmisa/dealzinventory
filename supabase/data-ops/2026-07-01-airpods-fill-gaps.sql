-- AirPods fill-gaps promotion (2026-07-01) — the FIFTH and final Apple part#-keyed device shape
-- (after iPhone/iPad/Mac/Watch), completing the Apple lineup. device_category='OTHER' (audio
-- accessory; the enum has no AUDIO/WEARABLE value, same decision as Apple Watch). IDENTITY =
-- part_number (each Apple SKU is distinct — no collapse; region variants are honestly separate rows).
-- chip/year enriched at harvest (a title 【year】 overrode the spec ref). os_family stays NULL (AirPods
-- run no user-facing OS). category_id = Accessories. ADDITIVE + idempotent (NOT-EXISTS on part_number).
-- Run AFTER 2026-07-01-airpods-reconcile.sql (which already cleaned the 5 legacy COMPUTER rows in place
-- — their part#s are skipped here).
INSERT INTO public.product_models
  (brand, model_name, color, color_ja, part_number, source_url,
   device_category, status, chipset, year, category_id)
SELECT DISTINCT ON (s.part_number)
  s.brand, s.model_name, coalesce(s.color_en, s.color_ja, '—') AS color, s.color_ja,
  s.part_number, s.source_url,
  'OTHER', 'ACTIVE',
  s.specs->>'chipset', nullif(s.specs->>'year', '')::int,
  'e2ebf134-d4ba-4220-9749-f6e2a2683210' -- Accessories
FROM public.iosys_catalog s
WHERE s.brand = 'Apple' AND s.device_category = 'OTHER'
  AND s.model_name ILIKE 'AirPods%'
  AND s.part_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.product_models pm
    WHERE pm.brand = 'Apple' AND pm.part_number = s.part_number
  )
ORDER BY s.part_number;
