-- Populate backorder_lines from iosys_backorder_candidates.
--
-- Source: public.iosys_backorder_candidates (loaded by run-backorder-harvest.ts) — iosys listings
-- that are Grade S (新品/未使用) or A (中古Aランク), with stock >= 2, SIM-free or carrier-unlocked.
--
-- This op:
--   1. Resolves each candidate to a product_models row (Apple part# → Android model_number/storage/
--      color → model_name/storage/color fallback).
--   2. Collapses carrier duplicates to ONE line per (product, grade, storage, color), keeping the
--      HIGHEST-stock listing as the representative (its price/url/image/accessories/stock).
--   3. Inserts backorder_lines: selling_price = supplier_price + ¥4,000 flat markup; supplier =
--      the iosys reference-only listing supplier; quantity_total = 1; lead time 4–7 working days.
--   4. Dedup guard: skips any candidate that already has an ACTIVE line with the same
--      (product, grade, storage, color) — so it is safe to re-run.
--
-- Idempotent + additive. Apply via:  supabase db query --linked -f supabase/data-ops/2026-06-29-backorder-populate.sql

BEGIN;

-- Resolve supplier (iosys reference-only listing; fall back to any iosys supplier).
DO $$
DECLARE v_supplier uuid;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers
   WHERE supplier_name ILIKE '%iosys%'
   ORDER BY is_reference_only DESC NULLS LAST
   LIMIT 1;
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'No iosys supplier found in public.suppliers';
  END IF;
  PERFORM set_config('app.bo_supplier', v_supplier::text, true);
END $$;

WITH matched AS (
  SELECT
    c.*,
    COALESCE(pm_part.id, pm_modelno.id, pm_name.id) AS product_id
  FROM public.iosys_backorder_candidates c
  -- (a) Apple part-number exact (iPhone / Apple Watch)
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND c.part_number IS NOT NULL
      AND pm.part_number = c.part_number
    LIMIT 1
  ) pm_part ON true
  -- (a2) Android model_number + storage + colour
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND c.part_number IS NULL
      AND c.model_number IS NOT NULL
      AND pm.model_number = c.model_number
      AND (c.storage_gb IS NULL
           OR NULLIF(regexp_replace(COALESCE(pm.storage_gb,''),'[^0-9]','','g'),'')::int = c.storage_gb)
      AND ( (c.color_en IS NOT NULL AND lower(pm.color) = lower(c.color_en))
            OR (c.color_ja IS NOT NULL AND pm.color_ja = c.color_ja)
            OR c.color_en IS NULL )
    ORDER BY (lower(COALESCE(pm.color,'')) = lower(COALESCE(c.color_en,''))) DESC
    LIMIT 1
  ) pm_modelno ON true
  -- (b) model_name + storage + colour fallback
  LEFT JOIN LATERAL (
    SELECT pm.id FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND lower(pm.model_name) = lower(c.model_name)
      AND (c.storage_gb IS NULL
           OR NULLIF(regexp_replace(COALESCE(pm.storage_gb,''),'[^0-9]','','g'),'')::int = c.storage_gb)
      AND ( (c.color_en IS NOT NULL AND lower(pm.color) = lower(c.color_en))
            OR (c.color_ja IS NOT NULL AND pm.color_ja = c.color_ja) )
    LIMIT 1
  ) pm_name ON true
),
-- Collapse carrier duplicates → one representative per (product, grade, storage, colour): the
-- highest-stock listing wins (its price/url/image/stock/accessories are used).
collapsed AS (
  SELECT DISTINCT ON (product_id, grade, storage_gb, lower(COALESCE(color_en, color_ja, '')))
    product_id,
    grade::condition_grade            AS condition_grade,
    storage_gb,
    COALESCE(color_en, color_ja)      AS color,
    color_ja,
    supplier_price,
    stock                             AS supplier_stock,
    supplier_url,
    iosys_code                        AS supplier_product_code,
    CASE
      WHEN accessories_ja IS NULL THEN NULL
      WHEN accessories_ja IN ('本体のみ','本体') THEN 'Device only'
      WHEN accessories_ja = 'なし' THEN 'None'
      ELSE accessories_ja
    END                               AS included_accessories
  FROM matched
  WHERE product_id IS NOT NULL
  ORDER BY product_id, grade, storage_gb, lower(COALESCE(color_en, color_ja, '')), stock DESC
)
INSERT INTO public.backorder_lines (
  backorder_code, product_id, condition_grade, color, color_ja, storage_gb,
  supplier_id, supplier_price, markup_jpy, selling_price, discount_amount,
  supplier_url, supplier_product_code, supplier_stock, included_accessories,
  quantity_total, lead_time_min_days, lead_time_days, status
)
SELECT
  public.generate_code('B','b_code_seq'),
  x.product_id,
  x.condition_grade,
  x.color,
  x.color_ja,
  x.storage_gb,
  current_setting('app.bo_supplier')::uuid,
  x.supplier_price,
  4000,
  COALESCE(x.supplier_price,0) + 4000,
  0,
  x.supplier_url,
  x.supplier_product_code,
  x.supplier_stock,
  x.included_accessories,
  1,
  4,
  7,
  'ACTIVE'
FROM collapsed x
WHERE NOT EXISTS (
  SELECT 1 FROM public.backorder_lines b
  WHERE b.status = 'ACTIVE'
    AND b.product_id = x.product_id
    AND b.condition_grade = x.condition_grade
    AND COALESCE(b.storage_gb, -1) = COALESCE(x.storage_gb, -1)
    AND lower(COALESCE(b.color,'')) = lower(COALESCE(x.color,''))
);

COMMIT;
