-- search_available_sell_groups: available sell groups (G-codes) for the messaging AI tool
-- and (optionally) the inventory modal. Mirrors src/services/items.ts searchAvailableSellGroups.
CREATE OR REPLACE FUNCTION search_available_sell_groups(
  search_query text,
  result_limit int DEFAULT 20,
  filter_brand text DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  price_min numeric DEFAULT NULL,
  price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  sell_group_code text,
  condition_grade text,
  effective_price numeric,
  available_count integer,
  brand text,
  model_name text,
  hero_media_url text
) AS $$
BEGIN
  RETURN QUERY
  WITH groups AS (
    SELECT
      sg.id,
      sg.sell_group_code,
      sg.condition_grade::text AS condition_grade,
      pm.brand,
      pm.model_name,
      pm.category_id,
      GREATEST(0, COALESCE(MIN(i.selling_price), 0) - COALESCE(sg.discount_amount, 0)) AS effective_price,
      COUNT(i.id)::int AS available_count,
      (SELECT pmed.file_url FROM product_media pmed
        WHERE pmed.product_id = pm.id
        ORDER BY CASE WHEN pmed.role = 'hero' THEN 0 ELSE 1 END, pmed.sort_order
        LIMIT 1) AS hero_media_url
    FROM sell_groups sg
    JOIN product_models pm ON pm.id = sg.product_id
    JOIN sell_group_items sgi ON sgi.sell_group_id = sg.id
    JOIN items i ON i.id = sgi.item_id AND i.item_status = 'AVAILABLE'
    WHERE sg.active = true
      AND (filter_brand IS NULL OR pm.brand ILIKE filter_brand)
      AND (filter_category_id IS NULL OR pm.category_id = filter_category_id)
      AND (
        search_query IS NULL OR search_query = '' OR (
          sg.sell_group_code ILIKE '%' || search_query || '%'
          OR pm.brand ILIKE '%' || search_query || '%'
          OR pm.model_name ILIKE '%' || search_query || '%'
          OR CONCAT_WS(' ', pm.brand, pm.model_name) ILIKE '%' || search_query || '%'
        )
      )
    GROUP BY sg.id, sg.sell_group_code, sg.condition_grade, sg.discount_amount, pm.id, pm.brand, pm.model_name, pm.category_id
  )
  SELECT g.id, g.sell_group_code, g.condition_grade, g.effective_price, g.available_count,
         g.brand, g.model_name, g.hero_media_url
  FROM groups g
  WHERE (price_min IS NULL OR g.effective_price >= price_min)
    AND (price_max IS NULL OR g.effective_price <= price_max)
  ORDER BY
    CASE WHEN search_query IS NOT NULL AND search_query != '' AND g.sell_group_code ILIKE search_query THEN 0 ELSE 1 END,
    g.sell_group_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_available_sell_groups(text, int, text, uuid, numeric, numeric)
  TO anon, authenticated, service_role;
