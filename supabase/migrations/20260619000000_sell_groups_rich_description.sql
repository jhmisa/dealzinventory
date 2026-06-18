-- search_available_sell_groups: add rich spec fields + category_description_fields so the
-- messaging AI renders G-code offers with the SAME description as P-code items. Specs are
-- sourced from a representative AVAILABLE member item (COALESCE(rep.<field>, pm.<field>)),
-- mirroring the item RPC (20260430100007) and the frontend getSellGroupDescription.
-- RETURNS TABLE shape changes, so the function must be dropped and recreated.
DROP FUNCTION IF EXISTS search_available_sell_groups(text, int, text, uuid, numeric, numeric);

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
        LIMIT 1) AS hero_media_url,
      COALESCE(rep.model_number, pm.model_number) AS model_number,
      COALESCE(rep.storage_gb, pm.storage_gb) AS storage_gb,
      COALESCE(rep.ram_gb, pm.ram_gb) AS ram_gb,
      COALESCE(rep.cpu, pm.cpu) AS cpu,
      COALESCE(rep.gpu, pm.gpu) AS gpu,
      COALESCE(rep.screen_size, pm.screen_size) AS screen_size,
      COALESCE(rep.color, pm.color) AS color,
      COALESCE(rep.os_family, pm.os_family) AS os_family,
      COALESCE(rep.year, pm.year) AS year,
      rep.battery_health_pct AS battery_health_pct,
      COALESCE(rep.is_unlocked, pm.is_unlocked) AS is_unlocked,
      COALESCE(rep.has_touchscreen, pm.has_touchscreen) AS has_touchscreen,
      (SELECT c.description_fields FROM categories c
        WHERE c.id = COALESCE(rep.category_id, pm.category_id)
        LIMIT 1) AS category_description_fields
    FROM sell_groups sg
    JOIN product_models pm ON pm.id = sg.product_id
    JOIN sell_group_items sgi ON sgi.sell_group_id = sg.id
    JOIN items i ON i.id = sgi.item_id AND i.item_status = 'AVAILABLE'
    LEFT JOIN LATERAL (
      SELECT i2.*
      FROM sell_group_items sgi2
      JOIN items i2 ON i2.id = sgi2.item_id AND i2.item_status = 'AVAILABLE'
      WHERE sgi2.sell_group_id = sg.id
      ORDER BY i2.item_code
      LIMIT 1
    ) rep ON true
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
    GROUP BY sg.id, sg.sell_group_code, sg.condition_grade, sg.discount_amount,
             pm.id, pm.brand, pm.model_name, pm.category_id,
             rep.model_number, pm.model_number, rep.storage_gb, pm.storage_gb,
             rep.ram_gb, pm.ram_gb, rep.cpu, pm.cpu, rep.gpu, pm.gpu,
             rep.screen_size, pm.screen_size, rep.color, pm.color,
             rep.os_family, pm.os_family, rep.year, pm.year,
             rep.battery_health_pct, rep.is_unlocked, pm.is_unlocked,
             rep.has_touchscreen, pm.has_touchscreen, rep.category_id
  )
  SELECT g.id, g.sell_group_code, g.condition_grade, g.effective_price, g.available_count,
         g.brand, g.model_name, g.hero_media_url,
         g.model_number, g.storage_gb, g.ram_gb, g.cpu, g.gpu, g.screen_size,
         g.color, g.os_family, g.year, g.battery_health_pct,
         g.is_unlocked, g.has_touchscreen, g.category_description_fields
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
