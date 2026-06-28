-- Phase B-Apple (Apple Watch) — SECTION 2: legacy reconcile (companion to the fill-gaps op).
-- 15 pre-existing Apple Watch product_models (13 ACTIVE + 2 DRAFT, device_category=COMPUTER) carried
-- dirty data: size+connectivity baked into model_name ("Watch Series 4 44MM GPS + Cellular"), case
-- material+band mashed into color ("Starlight Aluminum, Midnight Sports Band"), inconsistent casing,
-- part#/A# in the wrong columns. 19 items reference them. Owner decision: reconcile inline.
--
-- TWO buckets:
--  (A) MERGE — 7 rows whose clean identity matches a promoted harvested twin (band/region variant or
--      different part# of the same case config). Repoint their items to the twin, archive the stub
--      (status=ARCHIVED + superseded_by). Identity collapses on case config, so a different part# is fine.
--  (B) CLEAN-IN-PLACE — 8 rows with no promoted twin (4 cellular configs iosys doesn't stock; 4 with a
--      band-derived/ambiguous case color). Normalize structural fields; keep the source's stated color
--      (never inventing a case color) and flag the 4 ambiguous ones in model_notes.
-- Idempotent: re-running is a no-op (items already repointed; rows already ARCHIVED/cleaned).

-- ============================== (A) MERGES ==============================
-- legacy_id -> twin_id (promoted canonical row)
WITH merges(legacy_id, twin_id) AS (
  VALUES
    ('b21a27e0-b7b1-45df-840b-19f69e8db54a'::uuid, '7764d5b3-6fbd-4eb2-a880-08c9ba01b6e9'::uuid), -- SE 3 40mm Alu Starlight GPS
    ('9aa19a21-8e30-4792-9f86-54b5c6edd11a'::uuid, '41099b4f-cfe4-481c-bd9a-5f3b74dfba09'::uuid), -- SE (2nd gen) 44mm Alu Midnight GPS
    ('7f18a293-3eae-4b1d-b341-d000a705e33e'::uuid, 'ee5d0d58-c01d-4fca-9e0d-e203b77da398'::uuid), -- Series 4 40mm Alu Space Gray GPS
    ('0a631a0e-6c81-4f1b-b659-bacb612fe419'::uuid, 'a6730a33-1ab6-44e3-9b50-82d1f09afa9b'::uuid), -- Series 5 40mm Stainless Gold Cell
    ('1951c913-7c74-41d3-96fe-15b2ced5896b'::uuid, '4436fc5e-e1e6-48ea-893e-dc3edd23faa3'::uuid), -- Series 6 44mm Alu Blue Cell
    ('0d0838c4-513d-4d83-ac91-9c27828e3c92'::uuid, '44640ac6-f18c-421a-87d1-709c7d1e099d'::uuid), -- Series 7 45mm Alu Midnight GPS
    ('5a2fd394-3b81-40c6-9953-8ddb6a238d36'::uuid, '02928d84-5d65-4e4e-b118-69c28fa433f5'::uuid)  -- Series 9 41mm Alu Starlight GPS
)
, repoint AS (
  UPDATE public.items i SET product_id = m.twin_id
  FROM merges m WHERE i.product_id = m.legacy_id
  RETURNING 1
)
UPDATE public.product_models pm
SET status = 'ARCHIVED', superseded_by = m.twin_id, updated_at = now()
FROM merges m WHERE pm.id = m.legacy_id;

-- ============================== (B) CLEAN-IN-PLACE ==============================
-- 4 not-stocked cellular configs — fully determinable, clean normally.
UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Series 4', form_factor='44mm Stainless Steel', color='Space Black',
  has_cellular=true, chipset='S4', year=2018, updated_at=now()
WHERE id='44a5646b-eb96-43ef-a93e-e98a45bc13e1';

UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Series 4', form_factor='44mm Stainless Steel', color='Silver',
  has_cellular=true, chipset='S4', year=2018, updated_at=now()
WHERE id='e7e8d80d-23d7-428f-9bf9-4a71d18f78c9';

UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Edition Series 5', form_factor='44mm Titanium', color='Space Black',
  has_cellular=true, chipset='S5', year=2019, updated_at=now()
WHERE id='a9b09197-acf6-428f-8d3e-5f0b77be9317';

UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Hermes Series 5', form_factor='44mm Stainless Steel', color='Space Black',
  has_cellular=true, chipset='S5', year=2019, part_number='MWW2J/A', updated_at=now()
WHERE id='dd081781-20a8-476f-bf8c-18b4174374e5';

-- 4 ambiguous case color (source value is a band color or an impossible case color) — normalize
-- structure, KEEP the source's stated color (not invented), flag for human verification.
UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Nike SE', form_factor='44mm Aluminum', color='Black',
  has_cellular=false, chipset='S5', year=2020,
  model_notes='Case color uncertain — legacy listing recorded a band color; verify.', updated_at=now()
WHERE id='c28f68de-c502-49c3-8479-d3e1c52cdd3d';

UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch SE', form_factor='44mm Aluminum', color='Midnight',
  has_cellular=false, chipset='S5', year=2020,
  model_notes='Case color uncertain — legacy listing recorded a band color; verify.', updated_at=now()
WHERE id='842d3ff8-f62b-4789-9454-29883fee0f02';

UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Series 4', form_factor='44mm Aluminum', color='Black',
  has_cellular=false, chipset='S4', year=2018,
  model_notes='Case color uncertain — Series 4 aluminum had no Black; verify.', updated_at=now()
WHERE id='bd303707-5557-4030-90aa-a412f1aab9d1';

UPDATE public.product_models SET
  device_category='OTHER', status='ACTIVE', os_family='watchOS',
  category_id='e2ebf134-d4ba-4220-9749-f6e2a2683210',
  model_name='Watch Series 7', form_factor='41mm Aluminum', color='Space Gray',
  has_cellular=false, chipset='S7', year=2021,
  model_notes='Case color uncertain — Series 7 aluminum had no Space Gray; verify.', updated_at=now()
WHERE id='8e58e735-d666-4041-835d-e7e57f8ac4f4';

-- ============================== (C) INTEGRITY INDEX ==============================
-- Partial UNIQUE on the wearable identity tuple (mirrors the ANDROID one). Created last, after the
-- reconcile leaves no duplicate ACTIVE configs.
CREATE UNIQUE INDEX IF NOT EXISTS product_models_wearable_sku_uniq
  ON public.product_models (brand, model_name, form_factor, color, has_cellular)
  WHERE device_category = 'OTHER' AND status = 'ACTIVE';
