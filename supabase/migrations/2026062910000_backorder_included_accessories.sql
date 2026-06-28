-- Backorder fuzzy-search/parser feature — included accessories (per-unit raw text)
-- Stores the iosys 付属品 list verbatim on the backorder line; carried onto the item
-- when the line is fulfilled with a real P-code. Editable by staff; never normalized here.
-- New tables aren't created, so the Oct-2026 ALTER DEFAULT PRIVILEGES grant policy does
-- not apply — ALTER TABLE ADD COLUMN inherits the table's existing grants/RLS.

ALTER TABLE public.backorder_lines ADD COLUMN IF NOT EXISTS included_accessories text;
ALTER TABLE public.items           ADD COLUMN IF NOT EXISTS included_accessories text;

-- Extend the fulfillment RPC: copy the line's included_accessories onto the item it is
-- fulfilled with (only when the item has none yet — never overwrite a staff-entered value).
-- Re-declared in full (CREATE OR REPLACE) to keep the file self-contained and idempotent.
CREATE OR REPLACE FUNCTION public.fulfill_backorder_with_item(
  p_order_item_id uuid,
  p_item_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line public.backorder_lines%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_oi   public.order_items%ROWTYPE;
BEGIN
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

  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_item_id;
  END IF;

  IF v_item.item_status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'item not AVAILABLE (status %)', v_item.item_status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'item already in an order';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sell_group_items WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'item in a sell group';
  END IF;

  IF v_item.product_id IS DISTINCT FROM v_line.product_id
     OR public._backorder_norm_storage_gb(v_item.storage_gb) IS DISTINCT FROM v_line.storage_gb
     OR nullif(lower(trim(coalesce(v_item.color,''))),'') IS DISTINCT FROM nullif(lower(trim(coalesce(v_line.color,''))),'')
     OR v_item.condition_grade IS DISTINCT FROM v_line.condition_grade THEN
    RAISE EXCEPTION 'core specs do not match backorder line';
  END IF;

  UPDATE public.order_items
    SET item_id = p_item_id,
        backorder_status = 'FULFILLED'
    WHERE id = p_order_item_id;

  UPDATE public.items
    SET item_status = 'RESERVED',
        included_accessories = COALESCE(v_item.included_accessories, v_line.included_accessories)
    WHERE id = p_item_id;

  UPDATE public.backorder_lines
    SET quantity_received = quantity_received + 1
    WHERE id = v_line.id;
END $$;

GRANT EXECUTE ON FUNCTION public.fulfill_backorder_with_item(uuid, uuid) TO authenticated, service_role;
