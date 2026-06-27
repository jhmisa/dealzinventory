-- Backorder feature — Task 9
-- Transactional fulfillment RPCs:
--   * mark_backorder_ordered:        AWAITING_ORDER -> ORDERED on a pre-order order_item
--   * fulfill_backorder_with_item:   swap a real AVAILABLE P-code into a waiting pre-order,
--                                    enforcing eligibility + a core-spec hard-block, then
--                                    flip the item to RESERVED (matching how normally-ordered
--                                    in-stock items are treated by place-shop-order/claim-mine)
--                                    and increment the line's quantity_received.
--
-- Verified against the LIVE schema (2026-06-27):
--   * item status enum:   item_status = ('INTAKE','AVAILABLE','REPAIR','MISSING','RESERVED','SOLD')
--     - normally-ordered in-stock items transition to 'RESERVED'
--       (supabase/functions/place-shop-order, claim-mine, claim-offer) -> use 'RESERVED' here too.
--   * items has FLATTENED core spec columns: product_id (uuid), color (text),
--     storage_gb (TEXT, e.g. '128GB', '1TB', '256GB SSD', '128'), condition_grade (enum).
--   * backorder_lines.storage_gb is INTEGER (e.g. 128). The two storage_gb columns are NOT
--     directly comparable, so we normalize items.storage_gb text -> integer GB (TB-aware)
--     before comparing. condition_grade is the same enum on both -> compared directly.
--   * sell_group_items(item_id) exists.
--   * order_items_backorder_chk requires: a FULFILLED preorder row has item_id set + status FULFILLED.

-- Normalize a free-text storage string ('128GB','1 TB','256GB SSD','128','1TB') to integer GB.
-- TB suffix -> *1000; otherwise the leading integer run is taken as GB. NULL/no-digits -> NULL.
CREATE OR REPLACE FUNCTION public._backorder_norm_storage_gb(p_raw text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN (regexp_match(p_raw, '(\d+)'))[1] IS NULL THEN NULL
    WHEN p_raw ~* 't\s*b' THEN ((regexp_match(p_raw, '(\d+)'))[1])::int * 1000
    ELSE ((regexp_match(p_raw, '(\d+)'))[1])::int
  END;
$$;

-- Mark a pre-order as ordered from supplier.
CREATE OR REPLACE FUNCTION public.mark_backorder_ordered(p_order_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.order_items
  SET backorder_status = 'ORDERED'
  WHERE id = p_order_item_id AND backorder_status = 'AWAITING_ORDER';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_item % not awaiting order', p_order_item_id;
  END IF;
END $$;

-- Swap a real P-code into a waiting pre-order, enforcing eligibility + core-spec match.
CREATE OR REPLACE FUNCTION public.fulfill_backorder_with_item(
  p_order_item_id uuid,
  p_item_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line public.backorder_lines%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_oi   public.order_items%ROWTYPE;
BEGIN
  -- Lock the order_item first.
  SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_item % not found', p_order_item_id;
  END IF;
  IF v_oi.backorder_line_id IS NULL
     OR v_oi.backorder_status NOT IN ('READY','ORDERED','AWAITING_ORDER') THEN
    RAISE EXCEPTION 'order_item % is not an open pre-order', p_order_item_id;
  END IF;

  SELECT * INTO v_line FROM public.backorder_lines WHERE id = v_oi.backorder_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'backorder_line % not found', v_oi.backorder_line_id;
  END IF;

  -- Lock the candidate item.
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_item_id;
  END IF;

  -- Eligibility.
  IF v_item.item_status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'item not AVAILABLE (status %)', v_item.item_status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'item already in an order';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sell_group_items WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'item in a sell group';
  END IF;

  -- Core-spec hard-block (mirrors _shared/backorder-match.ts: product_id, storage_gb, color, condition_grade).
  -- storage_gb: items column is messy free-text, line column is integer -> normalize item side.
  -- color: case/whitespace-insensitive (matches norm() in backorder-match.ts).
  IF v_item.product_id IS DISTINCT FROM v_line.product_id
     OR public._backorder_norm_storage_gb(v_item.storage_gb) IS DISTINCT FROM v_line.storage_gb
     OR nullif(lower(trim(coalesce(v_item.color,''))),'') IS DISTINCT FROM nullif(lower(trim(coalesce(v_line.color,''))),'')
     OR v_item.condition_grade IS DISTINCT FROM v_line.condition_grade THEN
    RAISE EXCEPTION 'core specs do not match backorder line';
  END IF;

  -- Perform the swap.
  UPDATE public.order_items
    SET item_id = p_item_id,
        backorder_status = 'FULFILLED'
    WHERE id = p_order_item_id;

  UPDATE public.items
    SET item_status = 'RESERVED'
    WHERE id = p_item_id;

  UPDATE public.backorder_lines
    SET quantity_received = quantity_received + 1
    WHERE id = v_line.id;
END $$;

GRANT EXECUTE ON FUNCTION public._backorder_norm_storage_gb(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_backorder_ordered(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_backorder_with_item(uuid, uuid) TO authenticated, service_role;
