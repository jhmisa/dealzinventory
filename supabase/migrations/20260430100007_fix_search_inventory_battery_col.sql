-- Fix: product_models does not have battery_health_pct column.
-- Use i.battery_health_pct directly instead of COALESCE with pm.
DROP FUNCTION IF EXISTS search_available_inventory(text, int, text, uuid, numeric, numeric);

CREATE OR REPLACE FUNCTION search_available_inventory(
  search_query text,
  result_limit int DEFAULT 20,
  filter_brand text DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  price_min numeric DEFAULT NULL,
  price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  item_code text,
  condition_grade text,
  selling_price numeric,
  product_id uuid,
  brand text,
  model_name text,
  model_number text,
  storage_gb text,
  ram_gb text,
  cpu text,
  gpu text,
  screen_size numeric,
  color text,
  os_family text,
  condition_notes text,
  year integer,
  first_item_display_url text,
  first_item_thumb_url text,
  hero_media_url text,
  first_product_media_url text,
  battery_health_pct integer,
  is_unlocked boolean,
  has_touchscreen boolean,
  supplier_description text,
  category_description_fields text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.item_code,
    i.condition_grade::text,
    i.selling_price,
    i.product_id,
    COALESCE(i.brand, pm.brand) AS brand,
    COALESCE(i.model_name, pm.model_name) AS model_name,
    COALESCE(i.model_number, pm.model_number) AS model_number,
    COALESCE(i.storage_gb, pm.storage_gb) AS storage_gb,
    COALESCE(i.ram_gb, pm.ram_gb) AS ram_gb,
    COALESCE(i.cpu, pm.cpu) AS cpu,
    COALESCE(i.gpu, pm.gpu) AS gpu,
    COALESCE(i.screen_size, pm.screen_size) AS screen_size,
    COALESCE(i.color, pm.color) AS color,
    COALESCE(i.os_family, pm.os_family) AS os_family,
    i.condition_notes,
    COALESCE(i.year, pm.year) AS year,
    (SELECT imed.file_url FROM item_media imed
     WHERE imed.item_id = i.id
     ORDER BY imed.sort_order LIMIT 1) AS first_item_display_url,
    (SELECT imed.thumbnail_url FROM item_media imed
     WHERE imed.item_id = i.id AND imed.thumbnail_url IS NOT NULL
     ORDER BY imed.sort_order LIMIT 1) AS first_item_thumb_url,
    (SELECT pmed.file_url FROM product_media pmed
     WHERE pmed.product_id = i.product_id AND pmed.role = 'hero'
     ORDER BY pmed.sort_order LIMIT 1) AS hero_media_url,
    (SELECT pmed.file_url FROM product_media pmed
     WHERE pmed.product_id = i.product_id
     ORDER BY pmed.sort_order LIMIT 1) AS first_product_media_url,
    i.battery_health_pct,
    COALESCE(i.is_unlocked, pm.is_unlocked) AS is_unlocked,
    COALESCE(i.has_touchscreen, pm.has_touchscreen) AS has_touchscreen,
    i.supplier_description,
    (SELECT c.description_fields FROM categories c
     WHERE c.id = COALESCE(i.category_id, pm.category_id)
     LIMIT 1) AS category_description_fields
  FROM items i
  LEFT JOIN product_models pm ON pm.id = i.product_id
  WHERE i.item_status = 'AVAILABLE'
    AND (
      search_query IS NULL OR search_query = '' OR (
        i.item_code ILIKE '%' || search_query || '%'
        OR CONCAT_WS(' ', COALESCE(i.brand, pm.brand), COALESCE(i.model_name, pm.model_name)) ILIKE '%' || search_query || '%'
        OR COALESCE(i.brand, pm.brand) ILIKE '%' || search_query || '%'
        OR COALESCE(i.model_name, pm.model_name) ILIKE '%' || search_query || '%'
        OR COALESCE(i.model_number, pm.model_number) ILIKE '%' || search_query || '%'
        OR i.supplier_description ILIKE '%' || search_query || '%'
      )
    )
    AND (filter_brand IS NULL OR COALESCE(i.brand, pm.brand) ILIKE filter_brand)
    AND (filter_category_id IS NULL OR COALESCE(i.category_id, pm.category_id) = filter_category_id)
    AND (price_min IS NULL OR i.selling_price >= price_min)
    AND (price_max IS NULL OR i.selling_price <= price_max)
  ORDER BY
    CASE WHEN search_query IS NOT NULL AND search_query != '' AND i.item_code ILIKE search_query THEN 0 ELSE 1 END,
    i.item_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
