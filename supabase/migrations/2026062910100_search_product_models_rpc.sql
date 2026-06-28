-- Shared fuzzy product-model search. Returns INDIVIDUAL product_models rows (not color-grouped),
-- bypassing the 1000-row PostgREST cap via a server-side LIMIT. Improves on
-- list_product_color_groups: (1) adds color_ja to the haystack (so ミント matches),
-- (2) each token matches if EITHER a \m word-boundary hit on the spaced haystack OR a
-- separator-stripped substring hit (normalize = lower + full-width→half-width + strip
-- spaces/hyphens/middle-dots ・), so "Xperia10"="Xperia 10", "SO52C"="SO-52C", "ミント" all match.
-- Ranking: exact model_number/part_number token first, then model_name prefix, then brand/model/color.

-- Normalize: lower-case, fold common full-width ASCII/digits to half-width, strip whitespace,
-- ASCII hyphen, JP middle-dot (・) and the long-vowel/horizontal-bar marks sometimes glued in codes.
CREATE OR REPLACE FUNCTION public._spm_normalize(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           lower(
             translate(
               coalesce(p,''),
               'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ' ||
               'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' ||
               '０１２３４５６７８９',
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ||
               'abcdefghijklmnopqrstuvwxyz' ||
               '0123456789'
             )
           ),
           '[\s\-・ー―‐]', '', 'g'
         );
$$;

CREATE OR REPLACE FUNCTION public.search_product_models(
  p_search      text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_limit       int  DEFAULT 50
)
RETURNS TABLE (
  id                uuid,
  brand             text,
  model_name        text,
  model_number      text,
  part_number       text,
  color             text,
  color_ja          text,
  short_description text,
  storage_gb        text,
  ram_gb            text,
  cpu               text,
  chipset           text,
  screen_size       numeric,
  category_id       uuid,
  category_name     text,
  status            public.product_status,
  hero_image_url    text,
  media_count       bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH hay AS (
    SELECT
      pm.*,
      concat_ws(' ',
        pm.brand, pm.model_name, pm.model_number, pm.part_number,
        pm.color, pm.color_ja, coalesce(pm.short_description,''), coalesce(pm.storage_gb,'')
      ) AS spaced_hay
    FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND (p_category_id IS NULL OR pm.category_id = p_category_id)
  ),
  filtered AS (
    SELECT h.*,
      public._spm_normalize(h.spaced_hay) AS norm_hay
    FROM hay h
    WHERE (
      p_search IS NULL OR btrim(p_search) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM regexp_split_to_table(btrim(p_search), '\s+') AS tok
        WHERE
          -- (a) word-boundary hit on the spaced haystack (precise, locale-aware)
          h.spaced_hay !~* ('\m' || regexp_replace(tok, '([^a-zA-Z0-9])', '\\\1', 'g'))
          -- AND (b) NO separator-stripped substring hit either -> token truly absent
          AND public._spm_normalize(h.spaced_hay) NOT LIKE
              ('%' || public._spm_normalize(tok) || '%')
      )
    )
  )
  SELECT
    f.id, f.brand, f.model_name, f.model_number, f.part_number,
    f.color, f.color_ja, f.short_description, f.storage_gb, f.ram_gb,
    f.cpu, f.chipset, f.screen_size, f.category_id,
    c.name AS category_name, f.status,
    (SELECT m.file_url FROM public.product_media m
       WHERE m.product_id = f.id
       ORDER BY (m.role = 'hero') DESC, m.sort_order ASC NULLS LAST
       LIMIT 1) AS hero_image_url,
    (SELECT count(*) FROM public.product_media m WHERE m.product_id = f.id) AS media_count
  FROM filtered f
  LEFT JOIN public.categories c ON c.id = f.category_id
  ORDER BY
    -- exact model_number / part_number token match first
    (p_search IS NOT NULL AND (
        lower(coalesce(f.model_number,'')) = lower(btrim(p_search))
        OR lower(coalesce(f.part_number,'')) = lower(btrim(p_search))
        OR public._spm_normalize(f.model_number) = public._spm_normalize(btrim(p_search))
     )) DESC,
    -- model_name prefix match next
    (p_search IS NOT NULL AND f.model_name ILIKE (btrim(p_search) || '%')) DESC,
    f.brand, f.model_name, f.color
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public._spm_normalize(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_product_models(text, uuid, int)
  TO authenticated, service_role;
