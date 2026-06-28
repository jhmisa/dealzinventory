-- One row per color group for the admin Product Models list.
-- SECURITY INVOKER (default) so categories RLS applies as the authenticated caller.
CREATE OR REPLACE FUNCTION public.list_product_color_groups(
  p_search      text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_media       text DEFAULT NULL   -- 'no-photo' | 'no-video' | NULL
)
RETURNS TABLE (
  representative_id uuid,
  color_key         text,
  brand             text,
  model_name        text,
  color             text,
  category_id       uuid,
  category_name     text,
  short_description text,
  storages          text[],
  sku_count         bigint,
  photo_count       bigint,
  video_count       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH groups AS (
    SELECT
      pm.color_key,
      (array_agg(pm.id ORDER BY
         nullif(regexp_replace(coalesce(pm.storage_gb,''), '[^0-9]', '', 'g'), '')::int NULLS LAST,
         pm.id))[1] AS representative_id,
      array_agg(DISTINCT pm.storage_gb) FILTER (WHERE pm.storage_gb IS NOT NULL) AS storages,
      count(*) AS sku_count
    FROM public.product_models pm
    GROUP BY pm.color_key
  )
  SELECT
    g.representative_id,
    g.color_key,
    r.brand,
    r.model_name,
    r.color,
    r.category_id,
    c.name AS category_name,
    r.short_description,
    g.storages,
    g.sku_count,
    (SELECT count(*) FROM public.product_media m
       WHERE m.product_id = g.representative_id AND m.media_type = 'image') AS photo_count,
    (SELECT count(*) FROM public.product_media m
       WHERE m.product_id = g.representative_id AND m.media_type = 'video') AS video_count
  FROM groups g
  JOIN public.product_models r ON r.id = g.representative_id
  LEFT JOIN public.categories c ON c.id = r.category_id
  WHERE (p_category_id IS NULL OR r.category_id = p_category_id)
    AND (p_search IS NULL OR (
      r.brand ILIKE '%'||p_search||'%' OR
      r.model_name ILIKE '%'||p_search||'%' OR
      r.color ILIKE '%'||p_search||'%' OR
      coalesce(r.short_description,'') ILIKE '%'||p_search||'%' OR
      EXISTS (SELECT 1 FROM unnest(g.storages) st WHERE st ILIKE '%'||p_search||'%')
    ))
    AND (
      p_media IS NULL
      OR (p_media = 'no-photo' AND NOT EXISTS (
            SELECT 1 FROM public.product_media m
            WHERE m.product_id = g.representative_id AND m.media_type='image'))
      OR (p_media = 'no-video' AND NOT EXISTS (
            SELECT 1 FROM public.product_media m
            WHERE m.product_id = g.representative_id AND m.media_type='video'))
    )
  ORDER BY r.brand, r.model_name, r.color;
$$;

GRANT EXECUTE ON FUNCTION public.list_product_color_groups(text, uuid, text)
  TO authenticated, service_role;
