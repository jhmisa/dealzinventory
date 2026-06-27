-- Backorder improvements: reference-only suppliers, per-line markup, lead-time range.
--
-- Context (owner request 2026-06-28):
--   1. "Iosys Tsushin Haiban-ka (Online)" is the canonical iosys sourcing reference for
--      backorders, but it must NOT be selectable for INTAKE (it is a price/spec reference,
--      not a place we physically receive stock from). Add a reference-only flag.
--   2. Backorder selling price = supplier price + a markup (default ¥4000, staff-adjustable
--      up or down). Persist the markup per line.
--   3. Lead time is a working-day RANGE ("4–7 working days from order"), not a single number.

-- 1. Reference-only suppliers --------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS is_reference_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.suppliers.is_reference_only IS
  'When true, the supplier is a sourcing/price reference (e.g. an iosys online listing) and is hidden from INTAKE supplier selection. Still available for backorder lines.';

UPDATE public.suppliers
   SET is_reference_only = true
 WHERE supplier_name = 'Iosys Tsushin Haiban-ka (Online)';

-- 2. Per-line markup -----------------------------------------------------------
ALTER TABLE public.backorder_lines
  ADD COLUMN IF NOT EXISTS markup_jpy numeric NOT NULL DEFAULT 4000;

COMMENT ON COLUMN public.backorder_lines.markup_jpy IS
  'Markup (¥) added to supplier_price to derive selling_price. Default ¥4000; staff can raise or lower it per line.';

-- 3. Lead-time range -----------------------------------------------------------
-- lead_time_days is reused as the UPPER bound (max); lead_time_min_days is the new lower
-- bound. Customer pre-order offers read "min–max working days".
ALTER TABLE public.backorder_lines
  ADD COLUMN IF NOT EXISTS lead_time_min_days integer NOT NULL DEFAULT 4;

COMMENT ON COLUMN public.backorder_lines.lead_time_days IS
  'Lead-time UPPER bound (max), in working days. Lower bound is lead_time_min_days.';
COMMENT ON COLUMN public.backorder_lines.lead_time_min_days IS
  'Lead-time LOWER bound (min), in working days. Upper bound is lead_time_days.';

-- Preserve the min <= max invariant for any pre-existing rows, then enforce it.
UPDATE public.backorder_lines
   SET lead_time_min_days = LEAST(lead_time_min_days, lead_time_days);

ALTER TABLE public.backorder_lines
  DROP CONSTRAINT IF EXISTS backorder_lines_lead_time_range_chk;
ALTER TABLE public.backorder_lines
  ADD CONSTRAINT backorder_lines_lead_time_range_chk
  CHECK (lead_time_min_days <= lead_time_days);

-- 4. Surface lead_time_min_days from the messaging-AI backorder search RPC so pre-order
--    offers can render the working-day range. Return shape otherwise unchanged (drop-in
--    for the shared mapBackorderRow mapper).
DROP FUNCTION IF EXISTS search_available_backorder_lines(text, int, text, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION search_available_backorder_lines(
  search_query text,
  result_limit int DEFAULT 20,
  filter_brand text DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  price_min numeric DEFAULT NULL,
  price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  backorder_code text,
  condition_grade text,
  selling_price numeric,
  available integer,
  lead_time_days integer,
  lead_time_min_days integer,
  brand text,
  model_name text,
  hero_media_url text,
  model_number text,
  storage_gb text,
  ram_gb text,
  cpu text,
  gpu text,
  screen_size numeric,
  color text,
  os_family text,
  year integer,
  battery_health_pct integer,
  is_unlocked boolean,
  has_touchscreen boolean,
  category_description_fields text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bl.id,
    bl.backorder_code,
    bl.condition_grade::text AS condition_grade,
    bl.selling_price,
    bl.available,
    bl.lead_time_days,
    bl.lead_time_min_days,
    pm.brand,
    pm.model_name,
    (SELECT m.file_url FROM backorder_line_media m
       WHERE m.backorder_line_id = bl.id
       ORDER BY m.sort_order
       LIMIT 1) AS hero_media_url,
    pm.model_number,
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
    AND (
      search_query IS NULL OR search_query = '' OR (
        bl.backorder_code ILIKE '%' || search_query || '%'
        OR pm.brand ILIKE '%' || search_query || '%'
        OR pm.model_name ILIKE '%' || search_query || '%'
        OR bl.color ILIKE '%' || search_query || '%'
        OR CONCAT_WS(' ', pm.brand, pm.model_name) ILIKE '%' || search_query || '%'
      )
    )
  ORDER BY
    CASE WHEN search_query IS NOT NULL AND search_query != '' AND bl.backorder_code ILIKE search_query THEN 0 ELSE 1 END,
    bl.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_available_backorder_lines(text, int, text, uuid, numeric, numeric)
  TO anon, authenticated, service_role;
