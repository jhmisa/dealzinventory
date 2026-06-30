-- ZTE legacy reconcile (2026-07-01). 17 ZTE rows were miscategorized device_category='COMPUTER'
-- with dirty model_names (embedded A-codes, trailing spaces, "Nubia" casing) and carry 53 live items.
-- They are genuine phones (Libero 5G / 5G III / 5G IV / Flip, nubia Flip2 5G / S 5G / S2). Recategorize
-- to ANDROID, clean the names (strip the trailing carrier code into model_number, normalize casing),
-- enrich the two models we have verified specs for, and supersede the 2 fresh null-storage rows that
-- become less-precise duplicates of a storage-bearing cleaned-legacy sibling. Non-destructive: no row
-- with items is deleted; the superseded rows carry 0 items. Legacy-only models without a verified spec
-- stay spec-less (flagged spec_known=false), never guessed.
BEGIN;

-- 1. Recategorize + clean the legacy COMPUTER rows. Strip a trailing (A)###ZT / NX###J code into
--    model_number; normalize "Nubia"->"nubia"; empty storage -> NULL.
UPDATE public.product_models SET
  device_category = 'ANDROID',
  os_family       = coalesce(os_family, 'Android'),
  storage_gb      = nullif(btrim(storage_gb), ''),
  model_number    = coalesce(model_number, (regexp_match(model_name, '(A\d{3}ZT|NX\d{3}J|\d{3}ZT)'))[1]),
  model_name      = regexp_replace(
                      regexp_replace(btrim(model_name), '\s*(A\d{3}ZT|NX\d{3}J|\d{3}ZT)\s*$', ''),
                      '^Nubia ', 'nubia ')  -- NB: Postgres regex word boundary is \y, not \b; anchor on the space
WHERE lower(brand) = 'zte' AND device_category = 'COMPUTER';

-- 1b. Unify the "nubia Flip 2 5G" / "nubia Flip2 5G" name variants to one canonical form.
UPDATE public.product_models SET model_name = 'nubia Flip2 5G'
WHERE lower(brand) = 'zte' AND device_category = 'ANDROID'
  AND model_name IN ('nubia Flip 2 5G', 'nubia Flip2 5G');

-- 2. Enrich the two cleaned-legacy models we have research-verified specs for.
UPDATE public.product_models SET cpu='MediaTek Dimensity 700', screen_size=6.67, year=2022, ram_gb='4'
WHERE lower(brand)='zte' AND device_category='ANDROID' AND model_name='Libero 5G III' AND cpu IS NULL;
UPDATE public.product_models SET cpu='Snapdragon 7 Gen 1', screen_size=6.9, year=2024, ram_gb='6'
WHERE lower(brand)='zte' AND device_category='ANDROID' AND model_name='Libero Flip' AND cpu IS NULL;

-- 3. Supersede fresh null-storage rows now duplicated by a storage-bearing cleaned-legacy sibling
--    (same brand/model/color). They carry 0 items; archive + point superseded_by at the precise row.
WITH dups AS (
  SELECT nr.id AS null_id, fr.id AS full_id
  FROM public.product_models nr
  JOIN public.product_models fr
    ON fr.brand = nr.brand AND fr.model_name = nr.model_name AND fr.color = nr.color
    AND fr.device_category = 'ANDROID' AND fr.status = 'ACTIVE'
    AND fr.storage_gb IS NOT NULL AND fr.id <> nr.id
  WHERE lower(nr.brand) = 'zte' AND nr.device_category = 'ANDROID' AND nr.status = 'ACTIVE'
    AND nr.storage_gb IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.items i WHERE i.product_id = nr.id)
)
UPDATE public.product_models pm SET status = 'ARCHIVED', superseded_by = dups.full_id
FROM dups WHERE pm.id = dups.null_id;

COMMIT;
