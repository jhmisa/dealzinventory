-- Backorder follow-ups #2 — add part_number to search_available_backorder_lines.
--
-- The Messages "Search Inventory" backorder source (services/items.ts
-- searchAvailableBackorderLines) needs to append the staff-only model identifier
-- `A3295 (MYWJ3J/A)` = model_number + part_number, matching Admin Items getBackorderDesc().
-- The RPC already returns model_number but NOT part_number, so add it here for true parity.
-- Otherwise identical to 20260627120200_search_backorder_lines.sql.

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
  brand text,
  model_name text,
  hero_media_url text,
  model_number text,
  part_number text,
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
    pm.brand,
    pm.model_name,
    (SELECT m.file_url FROM backorder_line_media m
       WHERE m.backorder_line_id = bl.id
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
