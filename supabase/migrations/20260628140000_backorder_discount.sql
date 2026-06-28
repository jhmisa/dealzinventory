-- Backorder lines can carry a customer discount. A pre-order can still be discounted
-- (Joey: "even though it was a pre-order we sometimes gave a discount"), mirroring
-- items.discount / sell_groups.discount_amount. The Admin Items "Amount" cell shows
-- Cost (supplier_price) / Sell (selling_price) / Disc / Profit (= Sell − Disc − Cost).
ALTER TABLE public.backorder_lines
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- Pre-order search/offer price must reflect the discount, the same way
-- search_available_sell_groups returns an already-discounted effective_price. The only
-- change vs the prior definition is selling_price -> GREATEST(0, selling_price - discount).
CREATE OR REPLACE FUNCTION public.search_available_backorder_lines(
  search_query text,
  result_limit integer DEFAULT 20,
  filter_brand text DEFAULT NULL::text,
  filter_category_id uuid DEFAULT NULL::uuid,
  price_min numeric DEFAULT NULL::numeric,
  price_max numeric DEFAULT NULL::numeric
)
 RETURNS TABLE(id uuid, backorder_code text, condition_grade text, selling_price numeric, available integer, lead_time_days integer, lead_time_min_days integer, brand text, model_name text, hero_media_url text, model_number text, storage_gb text, ram_gb text, cpu text, gpu text, screen_size numeric, color text, os_family text, year integer, battery_health_pct integer, is_unlocked boolean, has_touchscreen boolean, category_description_fields text[])
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    bl.id,
    bl.backorder_code,
    bl.condition_grade::text AS condition_grade,
    -- Effective (discounted) price so pre-order offers/search charge what the customer pays.
    GREATEST(0, bl.selling_price - COALESCE(bl.discount_amount, 0)) AS selling_price,
    bl.available,
    bl.lead_time_days,
    bl.lead_time_min_days,
    pm.brand,
    pm.model_name,
    (SELECT m.file_url FROM backorder_line_media m
       WHERE m.backorder_line_id = bl.id
       ORDER BY m.sort_order
       LIMIT 1) AS hero_media_url,
    pm.model_number,
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
$function$;

-- release_backorder_unit: free one reserved pre-order unit when its order_item is
-- cancelled or removed. Decrements quantity_reserved (so generated `available` rises and the
-- B-code becomes mineable again) ONLY while the reservation is still open — a FULFILLED unit
-- was already swapped to a real item whose status the cancel path reverts separately. Unlinks
-- the order_item so the release is idempotent (a second call is a no-op) and the row drops out
-- of the to-fulfill queue. Mirrors reserve_backorder_unit's locking discipline.
CREATE OR REPLACE FUNCTION public.release_backorder_unit(p_order_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_oi public.order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND OR v_oi.backorder_line_id IS NULL THEN RETURN; END IF;

  IF v_oi.backorder_status IN ('AWAITING_ORDER','ORDERED','READY') THEN
    UPDATE public.backorder_lines
      SET quantity_reserved = GREATEST(0, quantity_reserved - 1)
      WHERE id = v_oi.backorder_line_id;
  END IF;

  -- Clear BOTH backorder columns together to satisfy order_items_backorder_chk (which couples
  -- backorder_line_id with backorder_status). Idempotent: a second call sees backorder_line_id
  -- already NULL and returns early above.
  UPDATE public.order_items
    SET backorder_line_id = NULL,
        backorder_status = NULL
    WHERE id = p_order_item_id;
END;
$function$;
