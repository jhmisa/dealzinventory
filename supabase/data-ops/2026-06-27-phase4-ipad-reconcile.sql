-- Phase 4 (iPad) reconcile + fill — APPLIED to remote 2026-06-27 (NOT a migration).
-- Driver: kaitori needs a COMPLETE, searchable iPad lineup (every model a seller might bring).
-- Granularity per §3b: (brand, model_name, color, storage_gb); connectivity (Wi-Fi vs
-- Wi-Fi + Cellular) is folded into model_name for tablets. carrier stays per-unit on items.
--
-- PART 1 (fill-gaps, PRIMARY): promote deduped domestic iosys TABLET SKUs into ACTIVE
--   product_models (device_category=TABLET), enriched from the staged spec reference.
-- PART 2 (reconcile legacy): map the old messy iPad rows (device_category=COMPUTER) to the
--   new canonical SKUs, re-point their items by (model, color, storage), archive emptied
--   legacy rows. Non-destructive: nothing deleted; unmappable rows keep their items + stay
--   ACTIVE (reported, not mis-pointed).

BEGIN;

-- ============ PART 1: fill-gaps canonical iPad SKUs ============
WITH mapped AS (
  SELECT model_name, color_en, color_ja, storage_gb, part_number, specs, source_url
  FROM public.iosys_catalog
  WHERE device_category='TABLET' AND (specs->>'is_domestic')='true' AND color_en IS NOT NULL
),
dedup AS (
  SELECT DISTINCT ON (model_name, color_en, storage_gb)
    model_name, color_en, color_ja, storage_gb, part_number, specs, source_url
  FROM mapped
  ORDER BY model_name, color_en, storage_gb, (part_number LIKE 'M%') DESC, part_number
)
INSERT INTO public.product_models
  (brand, model_name, color, color_ja, storage_gb, part_number,
   chipset, screen_size, year, ram_gb, os_family, device_category, status,
   source_url, verified_at, has_bluetooth, has_camera)
SELECT 'Apple', d.model_name, d.color_en, d.color_ja, d.storage_gb::text||'GB', d.part_number,
  d.specs->>'chipset', (d.specs->>'screen_size')::numeric, (d.specs->>'year')::int,
  d.specs->>'ram_gb', 'iPadOS', 'TABLET', 'ACTIVE', d.source_url, now(), true, true
FROM dedup d
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_models pm
  WHERE pm.brand='Apple' AND pm.device_category='TABLET' AND pm.status='ACTIVE'
    AND pm.model_name=d.model_name AND pm.color=d.color_en AND pm.storage_gb=d.storage_gb::text||'GB'
);

-- ============ PART 2: reconcile legacy iPad rows ============
CREATE TEMP TABLE legacy_map ON COMMIT DROP AS
WITH legacy AS (
  SELECT id, btrim(model_name) raw
  FROM public.product_models
  WHERE brand='Apple' AND status='ACTIVE' AND model_name ILIKE 'ipad%'
    AND device_category IS DISTINCT FROM 'TABLET' -- exclude the canonical rows just inserted
),
m AS (
  SELECT id, raw,
    (regexp_match(raw, '(\d+)'))[1]::int AS gen,
    (raw ~* 'cellular') AS cell,
    CASE WHEN raw ~* 'mini' THEN 'iPad mini'
         WHEN raw ~* 'pro'  THEN 'iPad Pro'
         ELSE 'iPad' END AS line
  FROM legacy
)
SELECT id, raw, gen, cell, line,
  CASE
    WHEN line='iPad' AND gen IS NOT NULL THEN
      'iPad (' || (CASE gen WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE gen||'th' END) || ' generation)'
    WHEN line='iPad mini' AND gen=7 THEN 'iPad mini (A17 Pro)'
    WHEN line='iPad mini' AND gen IS NOT NULL THEN
      'iPad mini (' || (CASE gen WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE gen||'th' END) || ' generation)'
    ELSE NULL -- iPad Pro w/o size, or unparseable: ambiguous, leave untouched
  END || (CASE WHEN (raw ~* 'cellular') THEN ' Wi-Fi + Cellular' ELSE ' Wi-Fi' END) AS canon
FROM m;

-- Re-point each item on a mappable legacy row to the matching canonical SKU (by model+color+storage).
WITH tgt AS (
  SELECT i.id AS item_id,
    (SELECT pm.id FROM public.product_models pm
      WHERE pm.brand='Apple' AND pm.device_category='TABLET' AND pm.status='ACTIVE'
        AND pm.model_name = lm.canon
        AND lower(replace(pm.color,' ','')) = lower(replace(i.color,' ',''))
        AND public._backorder_norm_storage_gb(pm.storage_gb)
            = public._backorder_norm_storage_gb(i.storage_gb)
      LIMIT 1) AS canon_id
  FROM legacy_map lm
  JOIN public.items i ON i.product_id = lm.id
  WHERE lm.canon IS NOT NULL
)
UPDATE public.items i SET product_id = t.canon_id, updated_at=now()
FROM tgt t WHERE i.id = t.item_id AND t.canon_id IS NOT NULL;

-- Archive legacy rows that now have zero items (fully reconciled or pre-existing stubs).
UPDATE public.product_models pm SET status='ARCHIVED', updated_at=now()
WHERE pm.id IN (SELECT id FROM legacy_map)
  AND NOT EXISTS (SELECT 1 FROM public.items i WHERE i.product_id = pm.id);

COMMIT;
