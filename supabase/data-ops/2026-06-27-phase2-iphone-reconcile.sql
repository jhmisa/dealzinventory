-- Phase 2 iPhone reconcile — APPLIED ONCE to remote 2026-06-27 (NOT a migration; depends on then-current messy state).
-- Non-destructive: enrich-in-place confident rows, find-or-merge split siblings, archive stubs.
-- Strategy + decisions: docs/superpowers/specs/2026-06-27-product-model-accuracy-iosys.md (Decision C, §3b).

BEGIN;

-- Per-existing-row plan with iosys-sourced enrichment.
CREATE TEMP TABLE recon ON COMMIT DROP AS
WITH existing AS (
  SELECT pm.id, btrim(pm.model_name) raw_model, pm.color raw_color,
         NULLIF(btrim(pm.storage_gb),'') row_storage
  FROM public.product_models pm
  WHERE pm.brand='Apple' AND pm.model_name ILIKE '%iphone%'
),
canon AS (
  SELECT e.*,
    CASE WHEN btrim(e.raw_model) ILIKE 'iphone se 2' THEN 'iPhone SE (2nd generation)'
         WHEN btrim(e.raw_model) ILIKE 'iphone se 3' THEN 'iPhone SE (3rd generation)'
         ELSE regexp_replace(regexp_replace(regexp_replace(e.raw_model,'^[Ii][Pp]hone','iPhone'),'\s+Mini\b',' mini'),'\s+',' ','g')
    END model_name,
    CASE WHEN e.raw_color IN ('Red','RED') THEN '(PRODUCT)RED'
         WHEN e.raw_color='Midnight Black' THEN 'Midnight' ELSE e.raw_color END color0
  FROM existing e
),
ist AS (
  SELECT i.product_id, count(*) n_items,
         count(DISTINCT public._backorder_norm_storage_gb(i.storage_gb)) n_storages,
         mode() WITHIN GROUP (ORDER BY public._backorder_norm_storage_gb(i.storage_gb)) dom
  FROM public.items i GROUP BY i.product_id
),
plan AS (
  SELECT c.*, COALESCE(s.n_items,0) n_items, COALESCE(s.n_storages,0) n_storages,
    COALESCE(s.dom, NULLIF(regexp_replace(COALESCE(c.row_storage,''),'[^0-9]','','g'),'')::int) target_storage,
    CASE WHEN COALESCE(s.n_items,0)=0 AND c.row_storage IS NULL THEN 'ARCHIVE'
         WHEN COALESCE(s.n_storages,0)>=2 THEN 'ENRICH+SPLIT' ELSE 'ENRICH' END action
  FROM canon c LEFT JOIN ist s ON s.product_id=c.id
)
SELECT p.id, p.model_name, p.color0, p.target_storage, p.action, p.n_storages,
  -- iosys color_en actually matched (resolves Space Gray / Silver alias)
  (SELECT ic.color_en FROM public.iosys_catalog ic WHERE ic.storage_gb=p.target_storage
     AND ((p.model_name ILIKE 'iPhone SE (2nd%' AND ic.model_name='iPhone SE' AND ic.model_number='A2296')
       OR (p.model_name ILIKE 'iPhone SE (3rd%' AND ic.model_name='iPhone SE' AND ic.model_number='A2782')
       OR (p.model_name NOT ILIKE 'iPhone SE %' AND lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(p.model_name,'\s+','','g'))))
     AND (ic.color_en=p.color0
       OR (p.color0 IN ('Black','Gray','Grey') AND p.model_name IN ('iPhone 8','iPhone X','iPhone XS','iPhone XS Max') AND ic.color_en='Space Gray')
       OR (p.color0='White' AND p.model_name IN ('iPhone 8','iPhone X','iPhone XS','iPhone XS Max') AND ic.color_en='Silver'))
     ORDER BY (ic.part_number LIKE 'M%') DESC, ic.part_number LIMIT 1) AS color_final,
  (SELECT ic.part_number FROM public.iosys_catalog ic WHERE ic.storage_gb=p.target_storage
     AND ((p.model_name ILIKE 'iPhone SE (2nd%' AND ic.model_name='iPhone SE' AND ic.model_number='A2296')
       OR (p.model_name ILIKE 'iPhone SE (3rd%' AND ic.model_name='iPhone SE' AND ic.model_number='A2782')
       OR (p.model_name NOT ILIKE 'iPhone SE %' AND lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(p.model_name,'\s+','','g'))))
     AND (ic.color_en=p.color0
       OR (p.color0 IN ('Black','Gray','Grey') AND p.model_name IN ('iPhone 8','iPhone X','iPhone XS','iPhone XS Max') AND ic.color_en='Space Gray')
       OR (p.color0='White' AND p.model_name IN ('iPhone 8','iPhone X','iPhone XS','iPhone XS Max') AND ic.color_en='Silver'))
     ORDER BY (ic.part_number LIKE 'M%') DESC, ic.part_number LIMIT 1) AS part
FROM plan p;

-- enrichment specs per model (identical per model in iosys) — added as columns via a model lookup
ALTER TABLE recon ADD COLUMN color_ja text, ADD COLUMN chipset text, ADD COLUMN screen numeric,
  ADD COLUMN yr int, ADD COLUMN ram text, ADD COLUMN src text;
UPDATE recon r SET
  color_ja = (SELECT ic.color_ja FROM public.iosys_catalog ic
              WHERE lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g'))
                AND ic.color_en=COALESCE(r.color_final,r.color0) LIMIT 1),
  chipset = (SELECT ic.specs->>'chipset' FROM public.iosys_catalog ic
              WHERE lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g'))
                AND ic.specs->>'chipset' IS NOT NULL LIMIT 1),
  screen = (SELECT (ic.specs->>'screen_size')::numeric FROM public.iosys_catalog ic
              WHERE lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g'))
                AND ic.specs->>'screen_size' IS NOT NULL LIMIT 1),
  yr = (SELECT (ic.specs->>'year')::int FROM public.iosys_catalog ic
              WHERE lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g'))
                AND ic.specs->>'year' IS NOT NULL LIMIT 1),
  ram = (SELECT ic.specs->>'ram_gb' FROM public.iosys_catalog ic
              WHERE lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g'))
                AND ic.specs->>'ram_gb' IS NOT NULL LIMIT 1),
  src = (SELECT ic.source_url FROM public.iosys_catalog ic
              WHERE lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g')) LIMIT 1);
UPDATE recon SET color_final = COALESCE(color_final, color0);

-- 1. ARCHIVE stubs (hidden from search; kept, not deleted)
UPDATE public.product_models SET status='ARCHIVED', updated_at=now()
WHERE id IN (SELECT id FROM recon WHERE action='ARCHIVE');

-- 2. ENRICH survivors (ENRICH + ENRICH+SPLIT main) in place — keeps their photos/items
UPDATE public.product_models pm SET
  model_name=r.model_name, color=r.color_final, color_ja=r.color_ja,
  storage_gb=r.target_storage::text||'GB', part_number=COALESCE(r.part, pm.part_number),
  chipset=COALESCE(r.chipset,pm.chipset), screen_size=COALESCE(r.screen,pm.screen_size),
  year=COALESCE(r.yr,pm.year), ram_gb=COALESCE(r.ram,pm.ram_gb),
  os_family=COALESCE(pm.os_family,'iOS'), device_category='IPHONE',
  source_url=COALESCE(r.src,pm.source_url), verified_at=now(), status='ACTIVE', updated_at=now()
FROM recon r WHERE pm.id=r.id AND r.action IN ('ENRICH','ENRICH+SPLIT');

-- 3. SPLIT minority-storage items -> find-or-create sibling SKU rows
DO $do$
DECLARE r record; s int; sib uuid; p text;
BEGIN
  FOR r IN SELECT * FROM recon WHERE action='ENRICH+SPLIT' LOOP
    FOR s IN SELECT DISTINCT public._backorder_norm_storage_gb(i.storage_gb) st
             FROM public.items i WHERE i.product_id=r.id LOOP
      IF s IS NULL OR s = r.target_storage THEN CONTINUE; END IF;
      SELECT id INTO sib FROM public.product_models
        WHERE brand='Apple' AND model_name=r.model_name AND color=r.color_final
          AND storage_gb=s::text||'GB' AND status='ACTIVE' LIMIT 1;
      IF sib IS NULL THEN
        SELECT ic.part_number INTO p FROM public.iosys_catalog ic
          WHERE ic.storage_gb=s AND ic.color_en=r.color_final
            AND lower(regexp_replace(ic.model_name,'\s+','','g'))=lower(regexp_replace(CASE WHEN r.model_name ILIKE 'iPhone SE %' THEN 'iPhone SE' ELSE r.model_name END,'\s+','','g'))
          ORDER BY (ic.part_number LIKE 'M%') DESC, ic.part_number LIMIT 1;
        INSERT INTO public.product_models(brand,model_name,color,color_ja,storage_gb,part_number,
          chipset,screen_size,year,ram_gb,os_family,device_category,status,source_url,verified_at,
          has_bluetooth,has_camera)
        VALUES('Apple',r.model_name,r.color_final,r.color_ja,s::text||'GB',p,
          r.chipset,r.screen,r.yr,r.ram,'iOS','IPHONE','ACTIVE',r.src,now(),true,true)
        RETURNING id INTO sib;
      END IF;
      UPDATE public.items SET product_id=sib, updated_at=now()
        WHERE product_id=r.id AND public._backorder_norm_storage_gb(storage_gb)=s;
    END LOOP;
  END LOOP;
END $do$;

-- 4. MERGE exact duplicates among ACTIVE iPhone rows (same model,color,storage):
--    keep earliest, re-point items/media/sell_groups, archive losers w/ superseded_by.
DO $do$
DECLARE g record; keep uuid; loser uuid;
BEGIN
  FOR g IN
    SELECT model_name,color,storage_gb FROM public.product_models
    WHERE brand='Apple' AND device_category='IPHONE' AND status='ACTIVE'
    GROUP BY 1,2,3 HAVING count(*)>1
  LOOP
    SELECT id INTO keep FROM public.product_models
      WHERE brand='Apple' AND status='ACTIVE' AND model_name=g.model_name
        AND color=g.color AND storage_gb=g.storage_gb ORDER BY created_at LIMIT 1;
    FOR loser IN SELECT id FROM public.product_models
      WHERE brand='Apple' AND status='ACTIVE' AND model_name=g.model_name
        AND color=g.color AND storage_gb=g.storage_gb AND id<>keep
    LOOP
      UPDATE public.items SET product_id=keep WHERE product_id=loser;
      UPDATE public.product_media SET product_id=keep WHERE product_id=loser;
      UPDATE public.sell_groups SET product_id=keep WHERE product_id=loser;
      UPDATE public.product_models SET status='ARCHIVED', superseded_by=keep, updated_at=now() WHERE id=loser;
    END LOOP;
  END LOOP;
END $do$;

COMMIT;
