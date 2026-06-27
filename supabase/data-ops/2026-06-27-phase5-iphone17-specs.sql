-- Phase 5 (partial) — fill iPhone 17/Air/17e specs (verified via Apple/GSMArena/Wikipedia 2026-06).
-- Clears the 32 spec-null active iPhone rows from Phase 3. APPLIED to remote 2026-06-27.
UPDATE public.product_models SET chipset='A19',     screen_size=6.3, year=2025, ram_gb='8'  WHERE device_category='IPHONE' AND model_name='iPhone 17'         AND chipset IS NULL;
UPDATE public.product_models SET chipset='A19 Pro', screen_size=6.3, year=2025, ram_gb='12' WHERE device_category='IPHONE' AND model_name='iPhone 17 Pro'     AND chipset IS NULL;
UPDATE public.product_models SET chipset='A19 Pro', screen_size=6.9, year=2025, ram_gb='12' WHERE device_category='IPHONE' AND model_name='iPhone 17 Pro Max' AND chipset IS NULL;
UPDATE public.product_models SET chipset='A19 Pro', screen_size=6.5, year=2025, ram_gb='12' WHERE device_category='IPHONE' AND model_name='iPhone Air'        AND chipset IS NULL;
UPDATE public.product_models SET chipset='A19',     screen_size=6.1, year=2026, ram_gb='8'  WHERE device_category='IPHONE' AND model_name='iPhone 17e'        AND chipset IS NULL;
