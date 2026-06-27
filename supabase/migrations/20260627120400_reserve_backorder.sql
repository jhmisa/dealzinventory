-- Backorder feature — Task 10
-- Atomically reserve 1 unit on a B-line and create the pre-order order_item.
--
-- Verified against the LIVE schema (2026-06-27):
--   * order_items NOT NULL columns w/o defaults: order_id (must be supplied).
--     quantity (DEFAULT 1), discount (DEFAULT 0), unit_price (DEFAULT 0) all default fine.
--   * order_items_backorder_chk requires, for an unfulfilled preorder row:
--       backorder_line_id IS NOT NULL, item_id IS NULL, backorder_status = 'AWAITING_ORDER'.
--   * backorder_lines.available is a GENERATED column (quantity_total - reserved - received);
--     it cannot be written, but reads under FOR UPDATE see the latest committed value and the
--     row lock serializes concurrent reservations.
--   * chk_order_items_quantity requires quantity > 0 -> rely on the DEFAULT 1.
CREATE OR REPLACE FUNCTION public.reserve_backorder_unit(
  p_order_id uuid,
  p_backorder_line_id uuid,
  p_unit_price numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_oi_id uuid; v_avail integer;
BEGIN
  -- Lock the line row so concurrent reservations serialize on availability.
  SELECT available INTO v_avail FROM public.backorder_lines WHERE id = p_backorder_line_id FOR UPDATE;
  IF v_avail IS NULL OR v_avail < 1 THEN RAISE EXCEPTION 'backorder line not available'; END IF;

  UPDATE public.backorder_lines SET quantity_reserved = quantity_reserved + 1 WHERE id = p_backorder_line_id;

  INSERT INTO public.order_items (order_id, backorder_line_id, backorder_status, unit_price, item_id)
  VALUES (p_order_id, p_backorder_line_id, 'AWAITING_ORDER', p_unit_price, NULL)
  RETURNING id INTO v_oi_id;

  RETURN v_oi_id;
END $$;

GRANT EXECUTE ON FUNCTION public.reserve_backorder_unit(uuid, uuid, numeric) TO authenticated, service_role;
