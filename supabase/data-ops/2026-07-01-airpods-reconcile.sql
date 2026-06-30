-- AirPods legacy reconcile (2026-07-01, runs BEFORE the fill-gaps).
-- 5 pre-existing AirPods rows were miscategorized as COMPUTER with dirty names ("Airpods 2nd Gen" …)
-- and 26 linked items. They are the SAME products as the AirPods harvest (part#-keyed, Apple pipeline),
-- so we clean them IN PLACE: recategorize COMPUTER→OTHER, canonicalize model_name to the parser's form,
-- enrich chip/year (research-verified, see airpods-specs.ts), file under Accessories, keep their items.
-- The fill-gaps that follows skips these part#s (NOT-EXISTS on brand+part_number).
--
-- Two rows had no part#: "Airpods Pro 3" gets MFHP4J/A (the ONLY Pro 3 SKU — unambiguous); "Airpods
-- 3rd Gen" stays part#-NULL (MME73J/A vs MPNY3J/A can't be disambiguated for those units → never guess;
-- the harvest's two 3rd-gen part# rows insert alongside it).
-- Idempotent: each UPDATE is gated on the dirty pre-reconcile shape (model_name + COMPUTER).

-- AirPods (2nd gen) — MV7N2J/A
UPDATE public.product_models
SET model_name='AirPods (2nd gen)', device_category='OTHER',
    chipset=COALESCE(NULLIF(chipset,''),'H1'), year=COALESCE(year,2019),
    category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210'
WHERE model_name='Airpods 2nd Gen' AND device_category='COMPUTER' AND part_number='MV7N2J/A';

-- AirPods 4 — MXP63J/A
UPDATE public.product_models
SET model_name='AirPods 4', device_category='OTHER',
    chipset=COALESCE(NULLIF(chipset,''),'H2'), year=COALESCE(year,2024),
    category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210'
WHERE model_name='Airpods 4th Gen' AND device_category='COMPUTER' AND part_number='MXP63J/A';

-- AirPods Pro (1st gen) — MWP22J/A
UPDATE public.product_models
SET model_name='AirPods Pro', device_category='OTHER',
    chipset=COALESCE(NULLIF(chipset,''),'H1'), year=COALESCE(year,2019),
    category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210'
WHERE model_name='AirPods Pro' AND device_category='COMPUTER' AND part_number='MWP22J/A';

-- AirPods Pro 3 — assign the unambiguous MFHP4J/A
UPDATE public.product_models
SET model_name='AirPods Pro 3', device_category='OTHER',
    part_number=COALESCE(part_number,'MFHP4J/A'),
    chipset=COALESCE(NULLIF(chipset,''),'H2'), year=COALESCE(year,2025),
    category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210'
WHERE model_name='Airpods Pro 3' AND device_category='COMPUTER';

-- AirPods (3rd gen) — keep part# NULL (units not disambiguable; never guess)
UPDATE public.product_models
SET model_name='AirPods (3rd gen)', device_category='OTHER',
    chipset=COALESCE(NULLIF(chipset,''),'H1'), year=COALESCE(year,2021),
    category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210'
WHERE model_name='Airpods 3rd Gen' AND device_category='COMPUTER';
