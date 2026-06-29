-- ============================================================================
-- Reusable separator-insensitive fuzzy search engine.
--
-- Problem: every search RPC matched the raw text, so removing/adding separators
-- broke matches that should obviously hit. Examples reported on the Product
-- Models page (list_product_color_groups), which only did \m word-boundary
-- matching with NO separator-stripped fallback:
--   "SO-51aa" found it, "SO51aa"      -> 0 results  (dash removed)
--   "Xperia 1 II" found it, "1II"     -> 0 results  (space removed)
--   "iPhone 11 Pro" found it, "11Pro" -> 0 results  (space removed / joined)
--   "Pro Max" found it, "ProMax"      -> 0 results  (joined)
--   "iphone 11" found it, "iphone11"  -> 0 results  (joined brand+number)
-- search_available_inventory had the same flaw (plain ILIKE '%query%').
--
-- Fix: ONE canonical engine used by every search RPC.
--   search_normalize(text)            -> fold full-width -> half-width, lower-case,
--                                        strip ALL whitespace + punctuation + JP
--                                        separators (・ ー ― ‐). Keeps alphanumerics
--                                        AND non-ASCII letters (Japanese) intact.
--   search_matches(haystack, query)   -> split the query on whitespace into tokens,
--                                        normalize each, and require EVERY non-empty
--                                        token to be a substring of the normalized
--                                        haystack (token-AND). Empty query matches all.
--
-- Because both sides are normalized identically, dash/space/punctuation differences
-- and joined-vs-split words all collapse to the same form, so every case above hits.
-- Token-AND keeps it accurate (each typed word must appear) while being order- and
-- separator-insensitive. Haystacks are short and per-row, fine at current scale.
-- ============================================================================

-- Canonical normalizer. Superset of the old _spm_normalize: also folds the rest of
-- the full-width ASCII block and strips ALL punctuation (so "MWHM2J/A" == "MWHM2JA").
CREATE OR REPLACE FUNCTION public.search_normalize(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
           lower(
             translate(
               coalesce(p, ''),
               'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ' ||
               'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' ||
               '０１２３４５６７８９',
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ||
               'abcdefghijklmnopqrstuvwxyz' ||
               '0123456789'
             )
           ),
           '[[:space:][:punct:]・ー―‐]+', '', 'g'
         );
$$;

-- Token-AND separator-insensitive matcher. Normalizes the haystack once, then checks
-- every whitespace-delimited query token (each normalized) is a substring of it.
CREATE OR REPLACE FUNCTION public.search_matches(haystack text, query text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  norm_hay text := public.search_normalize(haystack);
  norm_tok text;
BEGIN
  FOR norm_tok IN
    SELECT public.search_normalize(t)
    FROM regexp_split_to_table(btrim(coalesce(query, '')), '\s+') AS t
  LOOP
    IF norm_tok <> '' AND strpos(norm_hay, norm_tok) = 0 THEN
      RETURN false;        -- a typed word is genuinely absent
    END IF;
  END LOOP;
  RETURN true;             -- empty query, or every token present
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_normalize(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_matches(text, text) TO anon, authenticated, service_role;

-- Keep the old helper name working: delegate to the canonical normalizer.
CREATE OR REPLACE FUNCTION public._spm_normalize(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.search_normalize(p);
$$;

-- ============================================================================
-- 1) Product Models admin list  (the page in the bug report)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_product_color_groups(
  p_search      text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_media       text DEFAULT NULL
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
    AND public.search_matches(
          concat_ws(' ',
            r.brand,
            r.model_name,
            g.model_number,
            r.color,
            coalesce(r.short_description, ''),
            array_to_string(g.storages, ' '),
            g.part_numbers_text
          ),
          p_search
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

-- ============================================================================
-- 2) Product Models picker (Add-Backorder etc.) — individual rows, ranked
-- ============================================================================
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
  WITH filtered AS (
    SELECT pm.*
    FROM public.product_models pm
    WHERE pm.status = 'ACTIVE'
      AND (p_category_id IS NULL OR pm.category_id = p_category_id)
      AND public.search_matches(
            concat_ws(' ',
              pm.brand, pm.model_name, pm.model_number, pm.part_number,
              pm.color, pm.color_ja, coalesce(pm.short_description,''), coalesce(pm.storage_gb,'')
            ),
            p_search
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
    -- exact model_number / part_number match first (separator-insensitive)
    (p_search IS NOT NULL AND btrim(p_search) <> '' AND (
        public.search_normalize(f.model_number) = public.search_normalize(p_search)
        OR public.search_normalize(f.part_number) = public.search_normalize(p_search)
     )) DESC,
    -- model_name prefix match next
    (p_search IS NOT NULL AND f.model_name ILIKE (btrim(p_search) || '%')) DESC,
    f.brand, f.model_name, f.color
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_product_models(text, uuid, int)
  TO authenticated, service_role;

-- ============================================================================
-- 3) Inventory item search (admin Items + messaging /mine)
-- ============================================================================
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
  discount numeric,
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
    i.discount,
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
    AND public.search_matches(
          concat_ws(' ',
            i.item_code,
            COALESCE(i.brand, pm.brand),
            COALESCE(i.model_name, pm.model_name),
            COALESCE(i.model_number, pm.model_number),
            COALESCE(i.color, pm.color),
            COALESCE(i.storage_gb, pm.storage_gb),
            i.supplier_description
          ),
          search_query
        )
    AND (filter_brand IS NULL OR COALESCE(i.brand, pm.brand) ILIKE filter_brand)
    AND (filter_category_id IS NULL OR COALESCE(i.category_id, pm.category_id) = filter_category_id)
    AND (price_min IS NULL OR i.selling_price >= price_min)
    AND (price_max IS NULL OR i.selling_price <= price_max)
  ORDER BY
    CASE WHEN public.search_normalize(search_query) <> ''
              AND public.search_normalize(i.item_code) = public.search_normalize(search_query)
         THEN 0 ELSE 1 END,
    i.item_code
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_available_inventory(text, int, text, uuid, numeric, numeric)
  TO anon, authenticated, service_role;

-- ============================================================================
-- 4) Backorder (pre-order) line search
--    Return shape matches the deployed function (20260628150000): includes
--    part_number; only the search predicate + exact-code ranking change.
-- ============================================================================
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
    AND public.search_matches(
          concat_ws(' ',
            bl.backorder_code,
            pm.brand,
            pm.model_name,
            bl.color,
            pm.model_number,
            pm.part_number,
            COALESCE(bl.storage_gb::text, pm.storage_gb)
          ),
          search_query
        )
  ORDER BY
    CASE WHEN public.search_normalize(search_query) <> ''
              AND public.search_normalize(bl.backorder_code) = public.search_normalize(search_query)
         THEN 0 ELSE 1 END,
    bl.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_available_backorder_lines(text, int, text, uuid, numeric, numeric)
  TO anon, authenticated, service_role;
