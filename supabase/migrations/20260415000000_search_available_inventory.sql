-- Search function for available inventory items
-- Searches item_code, brand, model_name, and concatenated brand+model_name
DROP FUNCTION IF EXISTS search_available_inventory(text, int);

CREATE OR REPLACE FUNCTION search_available_inventory(search_query text, result_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  item_code text,
  condition_grade text,
  selling_price numeric,
  product_id uuid,
  brand text,
  model_name text,
  storage_gb text,
  ram_gb text,
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
    i.condition_grade::text,
    i.selling_price,
    i.product_id,
    i.brand,
    i.model_name,
    i.storage_gb,
    i.ram_gb,
    (SELECT pmed.file_url FROM product_media pmed
     WHERE pmed.product_id = i.product_id AND pmed.role = 'hero'
     ORDER BY pmed.sort_order LIMIT 1) AS hero_media_url,
    (SELECT pmed.file_url FROM product_media pmed
     WHERE pmed.product_id = i.product_id
     ORDER BY pmed.sort_order LIMIT 1) AS first_product_media_url,
    (SELECT imed.file_url FROM item_media imed
     WHERE imed.item_id = i.id
     ORDER BY imed.sort_order LIMIT 1) AS first_item_media_url,
    (SELECT imed.thumbnail_url FROM item_media imed
     WHERE imed.item_id = i.id AND imed.thumbnail_url IS NOT NULL
     ORDER BY imed.sort_order LIMIT 1) AS first_item_thumb_url
  FROM items i
  WHERE i.item_status = 'AVAILABLE'
    AND (
      i.item_code ILIKE '%' || search_query || '%'
      OR CONCAT_WS(' ', i.brand, i.model_name) ILIKE '%' || search_query || '%'
      OR i.brand ILIKE '%' || search_query || '%'
      OR i.model_name ILIKE '%' || search_query || '%'
    )
  ORDER BY
    CASE WHEN i.item_code ILIKE search_query THEN 0 ELSE 1 END,
    i.item_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
