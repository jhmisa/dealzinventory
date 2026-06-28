-- Product Models list (Option A): one row per color group, but the "Product Model"
-- cell renders one line per storage SKU. So the RPC now returns:
--   * model_number  — the A-number, constant per model line (shown once at group level)
--   * skus          — jsonb array of {storage_gb, part_number}, one entry per storage SKU,
--                     ordered by storage size (part# is unique per storage)
-- Search is upgraded to multi-token AND across a concatenated identifier haystack
-- (brand + model_name + model_number + color + storages + part_numbers), so
-- "iPhone 15 256", "A3089", and "MTMN3J/A" all match.
-- SECURITY INVOKER (default) so categories RLS applies as the authenticated caller.
-- DROP first: adding model_number/skus changes the RETURNS TABLE shape, which
-- CREATE OR REPLACE cannot do.
DROP FUNCTION IF EXISTS public.list_product_color_groups(text, uuid, text);

CREATE FUNCTION public.list_product_color_groups(
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
  model_number      text,
  category_id       uuid,
  category_name     text,
  short_description text,
  storages          text[],
  skus              jsonb,
  sku_count         bigint,
  photo_count       bigint,
  video_count       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      pm.*,
      nullif(regexp_replace(coalesce(pm.storage_gb,''), '[^0-9]', '', 'g'), '')::int AS storage_int
    FROM public.product_models pm
  ),
  groups AS (
    SELECT
      b.color_key,
      (array_agg(b.id ORDER BY b.storage_int NULLS LAST, b.id))[1] AS representative_id,
      array_agg(DISTINCT b.storage_gb) FILTER (WHERE b.storage_gb IS NOT NULL) AS storages,
      max(b.model_number) AS model_number,
      jsonb_agg(
        jsonb_build_object('storage_gb', b.storage_gb, 'part_number', b.part_number)
        ORDER BY b.storage_int NULLS LAST, b.id
      ) FILTER (WHERE b.storage_gb IS NOT NULL OR b.part_number IS NOT NULL) AS skus,
      string_agg(DISTINCT coalesce(b.part_number, ''), ' ') AS part_numbers_text,
      count(*) AS sku_count
    FROM base b
    GROUP BY b.color_key
  )
  SELECT
    g.representative_id,
    g.color_key,
    r.brand,
    r.model_name,
    r.color,
    g.model_number,
    r.category_id,
    c.name AS category_name,
    r.short_description,
    g.storages,
    coalesce(g.skus, '[]'::jsonb) AS skus,
    g.sku_count,
    (SELECT count(*) FROM public.product_media m
       WHERE m.product_id = g.representative_id AND m.media_type = 'image') AS photo_count,
    (SELECT count(*) FROM public.product_media m
       WHERE m.product_id = g.representative_id AND m.media_type = 'video') AS video_count
  FROM groups g
  JOIN public.product_models r ON r.id = g.representative_id
  LEFT JOIN public.categories c ON c.id = r.category_id
  WHERE (p_category_id IS NULL OR r.category_id = p_category_id)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      -- multi-token AND: every whitespace-delimited token must appear somewhere in the
      -- group's concatenated identifier haystack.
      OR NOT EXISTS (
        SELECT 1
        FROM regexp_split_to_table(btrim(p_search), '\s+') AS tok
        WHERE concat_ws(' ',
                r.brand,
                r.model_name,
                g.model_number,
                r.color,
                coalesce(r.short_description, ''),
                array_to_string(g.storages, ' '),
                g.part_numbers_text
              ) NOT ILIKE '%' || tok || '%'
      )
    )
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
