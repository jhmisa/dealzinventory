-- Backorder gallery inheritance (Part E2): drop the now-redundant curated media layer.
--
-- B-codes now inherit their product model's product_media gallery as the single photo source
-- (Part A). This migration removes backorder_line_media once it is provably redundant.
--
-- STEP 0 — GUARD. Abort if ANY backorder line (any status — this runs as postgres and sees all)
-- still relies on a curated photo while its product model has NO product_media. Refusing here
-- means no B-code silently loses its only photo; harvest/backfill those models first (Part E1).
DO $$
DECLARE stranded int;
BEGIN
  SELECT count(*) INTO stranded
  FROM backorder_lines bl
  WHERE EXISTS (SELECT 1 FROM backorder_line_media m WHERE m.backorder_line_id = bl.id)
    AND NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = bl.product_id);
  IF stranded > 0 THEN
    RAISE EXCEPTION 'Refusing to drop backorder_line_media: % B-line(s) would lose their only photo (model has no product_media). Harvest those models first.', stranded;
  END IF;
END $$;

-- STEP 1 — Repoint the only live function that reads backorder_line_media.
-- search_available_backorder_lines (messaging AI inventory-search + admin) sourced its
-- hero_media_url from the curated table; move it to the first product_media image so the
-- pre-order offer photo now comes from the model gallery (Part A benefit at the RPC level).
CREATE OR REPLACE FUNCTION public.search_available_backorder_lines(search_query text, result_limit integer DEFAULT 20, filter_brand text DEFAULT NULL::text, filter_category_id uuid DEFAULT NULL::uuid, price_min numeric DEFAULT NULL::numeric, price_max numeric DEFAULT NULL::numeric)
 RETURNS TABLE(id uuid, backorder_code text, condition_grade text, selling_price numeric, available integer, lead_time_days integer, brand text, model_name text, hero_media_url text, model_number text, part_number text, storage_gb text, ram_gb text, cpu text, gpu text, screen_size numeric, color text, os_family text, year integer, battery_health_pct integer, is_unlocked boolean, has_touchscreen boolean, category_description_fields text[])
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    bl.id,
    bl.backorder_code,
    bl.condition_grade::text AS condition_grade,
    bl.selling_price,
    bl.available,
    bl.lead_time_days,
    pm.brand,
    pm.model_name,
    (SELECT m.file_url FROM product_media m
       WHERE m.product_id = bl.product_id
         AND m.media_type = 'image'
       ORDER BY m.sort_order
       LIMIT 1) AS hero_media_url,
    pm.model_number,
    pm.part_number,
    COALESCE(bl.storage_gb::text, pm.storage_gb) AS storage_gb,
    COALESCE(bl.ram_gb::text, pm.ram_gb) AS ram_gb,
    COALESCE(bl.cpu, pm.cpu) AS cpu,
    pm.gpu,
    COALESCE(bl.screen_size, pm.screen_size) AS screen_size,
    COALESCE(bl.color, pm.color) AS color,
    pm.os_family,
    pm.year,
    NULL::integer AS battery_health_pct,
    pm.is_unlocked,
    pm.has_touchscreen,
    (SELECT c.description_fields FROM categories c
       WHERE c.id = pm.category_id
       LIMIT 1) AS category_description_fields
  FROM backorder_lines bl
  JOIN product_models pm ON pm.id = bl.product_id
  WHERE bl.status = 'ACTIVE'
    AND bl.available > 0
    AND (filter_brand IS NULL OR pm.brand ILIKE filter_brand)
    AND (filter_category_id IS NULL OR pm.category_id = filter_category_id)
    AND (price_min IS NULL OR bl.selling_price >= price_min)
    AND (price_max IS NULL OR bl.selling_price <= price_max)
    AND public.search_matches(
          concat_ws(' ',
            bl.backorder_code,
            pm.brand,
            pm.model_name,
            bl.color,
            pm.model_number,
            pm.part_number,
            COALESCE(bl.storage_gb::text, pm.storage_gb)
          ),
          search_query
        )
  ORDER BY
    CASE WHEN public.search_normalize(search_query) <> ''
              AND public.search_normalize(bl.backorder_code) = public.search_normalize(search_query)
         THEN 0 ELSE 1 END,
    bl.created_at DESC
  LIMIT result_limit;
END;
$function$;

-- STEP 2 — Drop the curated table (its RLS policies + index go with CASCADE).
DROP TABLE IF EXISTS public.backorder_line_media CASCADE;

-- STEP 3 — Drop the now-unused enum (only column that used it was backorder_line_media.source).
DROP TYPE IF EXISTS public.backorder_media_source;

-- NOTE: the 'backorder-media' storage bucket, its 284 objects, and its 3 storage.objects
-- policies are removed via the Storage API in a companion step (Supabase blocks direct
-- DELETE on storage.objects/buckets from SQL migrations). See the Part E2 execution log /
-- data-op that empties + deletes the bucket after this migration applies.
