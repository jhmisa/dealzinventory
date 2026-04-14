-- Search function for available inventory items
-- Handles cross-table search (items + product_models) and multi-word queries
CREATE OR REPLACE FUNCTION search_available_inventory(search_query text, result_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  item_code text,
  condition_grade text,
  selling_price numeric,
  product_model_id uuid,
  brand text,
  model_name text,
  storage_gb integer,
  ram_gb integer,
  category_description_fields jsonb,
  hero_media_url text,
  first_product_media_url text,
  first_item_media_url text,
  first_item_thumb_url text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.item_code,
    i.condition_grade,
    i.selling_price,
    pm.id AS product_model_id,
    pm.brand,
    pm.model_name,
    pm.storage_gb,
    pm.ram_gb,
    c.description_fields::jsonb AS category_description_fields,
    (SELECT pmed.file_url FROM product_media pmed
     WHERE pmed.product_model_id = pm.id AND pmed.role = 'hero'
     ORDER BY pmed.sort_order LIMIT 1) AS hero_media_url,
    (SELECT pmed.file_url FROM product_media pmed
     WHERE pmed.product_model_id = pm.id
     ORDER BY pmed.sort_order LIMIT 1) AS first_product_media_url,
    (SELECT imed.file_url FROM item_media imed
     WHERE imed.item_id = i.id
     ORDER BY imed.sort_order LIMIT 1) AS first_item_media_url,
    (SELECT imed.thumbnail_url FROM item_media imed
     WHERE imed.item_id = i.id AND imed.thumbnail_url IS NOT NULL
     ORDER BY imed.sort_order LIMIT 1) AS first_item_thumb_url
  FROM items i
  LEFT JOIN product_models pm ON i.product_model_id = pm.id
  LEFT JOIN categories c ON pm.category_id = c.id
  WHERE i.item_status = 'AVAILABLE'
    AND (
      i.item_code ILIKE '%' || search_query || '%'
      OR CONCAT_WS(' ', pm.brand, pm.model_name) ILIKE '%' || search_query || '%'
      OR pm.brand ILIKE '%' || search_query || '%'
      OR pm.model_name ILIKE '%' || search_query || '%'
    )
  ORDER BY
    CASE WHEN i.item_code ILIKE search_query THEN 0 ELSE 1 END,
    i.item_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
