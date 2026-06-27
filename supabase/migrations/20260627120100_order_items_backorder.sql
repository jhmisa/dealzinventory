DO $$ BEGIN
  CREATE TYPE backorder_fulfillment_status AS ENUM ('AWAITING_ORDER','ORDERED','READY','FULFILLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS backorder_line_id uuid REFERENCES public.backorder_lines(id),
  ADD COLUMN IF NOT EXISTS backorder_status backorder_fulfillment_status;

-- item_id is already nullable (20260319120000); kept here as a safe no-op for clarity.
ALTER TABLE public.order_items ALTER COLUMN item_id DROP NOT NULL;

-- Legal combinations:
--  no-backorder row (real item OR ad-hoc/custom line): backorder_line_id null, status null, item_id set OR null
--  unfulfilled preorder: item_id null, backorder_line_id set, status in (AWAITING_ORDER,ORDERED,READY)
--  fulfilled preorder:   item_id set,  backorder_line_id set, status = FULFILLED
ALTER TABLE public.order_items ADD CONSTRAINT order_items_backorder_chk CHECK (
  (backorder_line_id IS NULL AND backorder_status IS NULL)
  OR (backorder_line_id IS NOT NULL AND item_id IS NULL AND backorder_status IN ('AWAITING_ORDER','ORDERED','READY'))
  OR (backorder_line_id IS NOT NULL AND item_id IS NOT NULL AND backorder_status = 'FULFILLED')
);

CREATE INDEX idx_order_items_backorder_line ON public.order_items(backorder_line_id) WHERE backorder_line_id IS NOT NULL;
