-- Phase B-Apple (Apple Watch) — fill-gaps promotion + legacy reconcile.
-- Apple Watch is the FOURTH Apple part#-keyed device shape (after iPhone/iPad/Mac). device_category=
-- 'OTHER' (wearable; the enum has no WEARABLE value). The SiP/year are NOT in the iosys title, so the
-- harvest enriched them from the verified apple-watch-specs reference (spec_known always true here).
--
-- IDENTITY collapses on the CASE config: (model_name, form_factor[=size+material], color, has_cellular).
-- The BAND is a swappable accessory and is dropped from identity; several Apple part#s share one case
-- config (region + band variants) → the part# is the coarse representative (DISTINCT ON prefers J/Japan).
-- form_factor holds "{size}mm {material}" (e.g. "45mm Aluminum"); has_cellular captures GPS vs
-- GPS+Cellular; chipset = SiP (S4..S10); os_family='watchOS'; category_id = Accessories.
-- ADDITIVE + idempotent (NOT-EXISTS guard on the identity tuple).
--
-- SECTION 2 (legacy reconcile) is in the companion file 2026-06-29-applewatch-reconcile.sql.

WITH src AS (
  SELECT DISTINCT ON (model_name, specs->>'form_factor', coalesce(color_en, color_ja, '—'), specs->>'has_cellular')
    brand, model_name,
    coalesce(color_en, color_ja, '—') AS color, color_ja,
    model_number, part_number, source_url, specs,
    specs->>'form_factor' AS form_factor,
    (specs->>'has_cellular')::boolean AS has_cellular
  FROM public.iosys_catalog
  WHERE device_category = 'OTHER' AND brand = 'Apple'
  ORDER BY model_name, specs->>'form_factor', coalesce(color_en, color_ja, '—'), specs->>'has_cellular',
           (specs->>'region_code' = 'J') DESC NULLS LAST, model_number
)
INSERT INTO public.product_models
  (brand, model_name, color, color_ja, model_number, part_number, source_url,
   device_category, status, chipset, year, os_family, form_factor, has_cellular, category_id)
SELECT
  s.brand, s.model_name, s.color, s.color_ja, s.model_number, s.part_number, s.source_url,
  'OTHER', 'ACTIVE',
  s.specs->>'chipset',
  nullif(s.specs->>'year', '')::int,
  'watchOS',
  s.form_factor,
  s.has_cellular,
  'e2ebf134-d4ba-4220-9749-f6e2a2683210' -- Accessories
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand = 'Apple' AND pm.device_category = 'OTHER'
    AND pm.model_name = s.model_name
    AND coalesce(pm.form_factor, '') = coalesce(s.form_factor, '')
    AND coalesce(pm.color, '') = coalesce(s.color, '')
    AND pm.has_cellular IS NOT DISTINCT FROM s.has_cellular
);
