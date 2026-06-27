-- Phase 4b (iPad) — synthesize canonical SKUs for combos iosys doesn't currently stock.
-- APPLIED to remote 2026-06-27 (NOT a migration). Follows phase4-ipad-reconcile.
-- Result: 15 SKUs synthesized; 3 unmappable legacy items remain ACTIVE (2 size-less
-- "iPad Pro" rows + 1 null-storage unit) — left untouched, not guessed.
--
-- Some owned units (legacy rows) are models/colors/storages iosys isn't selling right now
-- (e.g. iPad 7th-gen Silver 128GB; iPad 11th-gen A16 entirely absent from the crawl). For a
-- COMPLETE kaitori catalog we still want those models, so we synthesize the canonical SKU
-- from the spec reference (specs borrowed from a same-base canonical sibling; explicit
-- fallback for bases with no sibling), then re-point the items and archive emptied legacy
-- rows. part_number left NULL (not in iosys stock) — identity is still exact.

BEGIN;

-- Legacy -> canonical mapping (same logic as phase4-ipad-reconcile).
CREATE TEMP TABLE lm ON COMMIT DROP AS
WITH legacy AS (
  SELECT id, btrim(model_name) raw FROM public.product_models
  WHERE brand='Apple' AND status='ACTIVE' AND model_name ILIKE 'ipad%'
    AND device_category IS DISTINCT FROM 'TABLET'),
m AS (
  SELECT id, raw, (regexp_match(raw,'(\d+)'))[1]::int AS gen, (raw ~* 'cellular') AS cell,
    CASE WHEN raw ~* 'mini' THEN 'iPad mini' WHEN raw ~* 'pro' THEN 'iPad Pro' ELSE 'iPad' END AS line
  FROM legacy)
SELECT id, raw,
  CASE
    WHEN line='iPad' AND gen IS NOT NULL THEN
      'iPad (' || (CASE gen WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE gen||'th' END) || ' generation)'
    WHEN line='iPad mini' AND gen=7 THEN 'iPad mini (A17 Pro)'
    WHEN line='iPad mini' AND gen IS NOT NULL THEN
      'iPad mini (' || (CASE gen WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE gen||'th' END) || ' generation)'
    ELSE NULL END || (CASE WHEN (raw ~* 'cellular') THEN ' Wi-Fi + Cellular' ELSE ' Wi-Fi' END) AS canon
FROM m;

-- Spec fallback for bases that have no existing canonical sibling to borrow from.
CREATE TEMP TABLE base_spec(base text, chipset text, screen numeric, yr int, ram text) ON COMMIT DROP;
INSERT INTO base_spec VALUES ('iPad (11th generation)', 'A16', 11.0, 2025, '6');

-- Distinct leftover (canon, color, storage) combos with no canonical SKU yet.
CREATE TEMP TABLE synth ON COMMIT DROP AS
SELECT DISTINCT lm.canon, i.color, public._backorder_norm_storage_gb(i.storage_gb) AS stor
FROM lm JOIN public.items i ON i.product_id = lm.id
WHERE lm.canon IS NOT NULL
  AND public._backorder_norm_storage_gb(i.storage_gb) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.product_models pm
    WHERE pm.brand='Apple' AND pm.device_category='TABLET' AND pm.status='ACTIVE'
      AND pm.model_name=lm.canon
      AND lower(replace(pm.color,' ','')) = lower(replace(i.color,' ',''))
      AND public._backorder_norm_storage_gb(pm.storage_gb) = public._backorder_norm_storage_gb(i.storage_gb));

INSERT INTO public.product_models
  (brand, model_name, color, storage_gb, chipset, screen_size, year, ram_gb,
   os_family, device_category, status, verified_at, has_bluetooth, has_camera)
SELECT 'Apple', s.canon, s.color, s.stor::text||'GB',
  COALESCE(sib.chipset, bs.chipset), COALESCE(sib.screen_size, bs.screen),
  COALESCE(sib.year, bs.yr), COALESCE(sib.ram_gb, bs.ram),
  'iPadOS', 'TABLET', 'ACTIVE', now(), true, true
FROM synth s
LEFT JOIN LATERAL (
  SELECT chipset, screen_size, year, ram_gb FROM public.product_models p
  WHERE p.brand='Apple' AND p.device_category='TABLET' AND p.status='ACTIVE'
    AND regexp_replace(p.model_name,' Wi-Fi.*$','') = regexp_replace(s.canon,' Wi-Fi.*$','')
    AND p.chipset IS NOT NULL LIMIT 1) sib ON true
LEFT JOIN base_spec bs ON bs.base = regexp_replace(s.canon,' Wi-Fi.*$','')
WHERE COALESCE(sib.chipset, bs.chipset) IS NOT NULL;

-- Re-point items to the (now-existing) canonical SKUs.
WITH tgt AS (
  SELECT i.id AS item_id,
    (SELECT pm.id FROM public.product_models pm
      WHERE pm.brand='Apple' AND pm.device_category='TABLET' AND pm.status='ACTIVE'
        AND pm.model_name = lm.canon
        AND lower(replace(pm.color,' ','')) = lower(replace(i.color,' ',''))
        AND public._backorder_norm_storage_gb(pm.storage_gb)
            = public._backorder_norm_storage_gb(i.storage_gb)
      LIMIT 1) AS canon_id
  FROM lm JOIN public.items i ON i.product_id = lm.id
  WHERE lm.canon IS NOT NULL)
UPDATE public.items i SET product_id = t.canon_id, updated_at=now()
FROM tgt t WHERE i.id = t.item_id AND t.canon_id IS NOT NULL;

-- Archive legacy rows now empty.
UPDATE public.product_models pm SET status='ARCHIVED', updated_at=now()
WHERE pm.id IN (SELECT id FROM lm)
  AND NOT EXISTS (SELECT 1 FROM public.items i WHERE i.product_id = pm.id);

COMMIT;
