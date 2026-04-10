-- ============================================================
-- Accessory Inventory System (A-code items)
-- Quantity-based tracking for commodity accessories
-- ============================================================

-- 1A. Add 'accessory' to supplier_type enum
ALTER TYPE supplier_type ADD VALUE IF NOT EXISTS 'accessory';

-- 1B. Sequence for A-codes
CREATE SEQUENCE IF NOT EXISTS a_code_seq START 1;

-- 1C. accessories table
CREATE TABLE accessories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_code      text NOT NULL UNIQUE,
  name                text NOT NULL,
  description         text,
  brand               text,
  category_id         uuid REFERENCES categories(id) ON DELETE SET NULL,
  selling_price       numeric(10,0) NOT NULL,
  stock_quantity      integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 5,
  shop_visible        boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_accessories_updated BEFORE UPDATE ON accessories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_accessories_code ON accessories (accessory_code);
CREATE INDEX idx_accessories_category ON accessories (category_id);
CREATE INDEX idx_accessories_active ON accessories (active);

-- 1D. accessory_media table
CREATE TABLE accessory_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id  uuid NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  file_url      text NOT NULL,
  media_type    text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accessory_media_accessory ON accessory_media (accessory_id);

-- 1E. accessory_stock_entries table (restock/intake records)
CREATE TABLE accessory_stock_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id    uuid NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  supplier_id     uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  receipt_id      uuid REFERENCES intake_receipts(id) ON DELETE SET NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  unit_cost       numeric(10,0) NOT NULL,
  total_cost      numeric(10,0) NOT NULL,
  notes           text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_entries_accessory ON accessory_stock_entries (accessory_id);
CREATE INDEX idx_stock_entries_receipt ON accessory_stock_entries (receipt_id);

-- 1F. accessory_stock_adjustments table
CREATE TYPE accessory_adjustment_reason AS ENUM (
  'DEFECTIVE', 'RETURNED_TO_SUPPLIER', 'DAMAGED', 'WRITE_OFF', 'CORRECTION'
);

CREATE TABLE accessory_stock_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id  uuid NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  quantity      integer NOT NULL CHECK (quantity > 0),
  reason        accessory_adjustment_reason NOT NULL,
  supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  notes         text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_adjustments_accessory ON accessory_stock_adjustments (accessory_id);

-- 1G. Modify order_items — add accessory_id
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS accessory_id uuid REFERENCES accessories(id) ON DELETE RESTRICT;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_order_items_type;
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_type CHECK (
  NOT (item_id IS NOT NULL AND accessory_id IS NOT NULL)
);

-- 1H. Modify offer_items — add accessory_id
ALTER TABLE offer_items ADD COLUMN IF NOT EXISTS accessory_id uuid REFERENCES accessories(id) ON DELETE RESTRICT;

ALTER TABLE offer_items DROP CONSTRAINT IF EXISTS chk_offer_items_type;
ALTER TABLE offer_items ADD CONSTRAINT chk_offer_items_type CHECK (
  NOT (item_id IS NOT NULL AND accessory_id IS NOT NULL)
);

-- 1I. Atomic stock RPCs
CREATE OR REPLACE FUNCTION decrement_accessory_stock(p_accessory_id uuid, p_quantity integer)
RETURNS integer AS $$
  UPDATE accessories SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_accessory_id AND stock_quantity >= p_quantity
  RETURNING stock_quantity;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION increment_accessory_stock(p_accessory_id uuid, p_quantity integer)
RETURNS integer AS $$
  UPDATE accessories SET stock_quantity = stock_quantity + p_quantity
  WHERE id = p_accessory_id
  RETURNING stock_quantity;
$$ LANGUAGE sql;

-- 1J. Accessory intake batch RPC
CREATE OR REPLACE FUNCTION create_accessory_intake_batch(
  p_supplier_id uuid,
  p_date_received date,
  p_invoice_file_url text,
  p_supplier_contact_snapshot text,
  p_notes text,
  p_line_items jsonb
) RETURNS jsonb AS $$
DECLARE
  v_receipt_id uuid;
  v_receipt_code text;
  v_line jsonb;
  v_accessory_id uuid;
  v_accessory_code text;
  v_quantity integer;
  v_unit_cost numeric;
  v_total_items integer := 0;
  v_total_cost numeric := 0;
  v_entries jsonb := '[]'::jsonb;
BEGIN
  -- Generate receipt code
  SELECT generate_code('RCV', 'rcv_code_seq') INTO v_receipt_code;

  -- Create intake receipt
  INSERT INTO intake_receipts (
    receipt_code, supplier_id, source_type, date_received,
    invoice_file_url, supplier_contact_snapshot, notes,
    total_items, total_cost, created_by
  ) VALUES (
    v_receipt_code, p_supplier_id, 'WHOLESALE', p_date_received,
    p_invoice_file_url, p_supplier_contact_snapshot, p_notes,
    0, 0, auth.uid()
  ) RETURNING id INTO v_receipt_id;

  -- Process each line item
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    v_quantity := (v_line->>'quantity')::integer;
    v_unit_cost := (v_line->>'unit_cost')::numeric;

    IF v_line->>'accessory_id' IS NOT NULL THEN
      -- Existing accessory
      v_accessory_id := (v_line->>'accessory_id')::uuid;
    ELSE
      -- New accessory — generate A-code and create
      SELECT generate_code('A', 'a_code_seq') INTO v_accessory_code;
      INSERT INTO accessories (
        accessory_code, name, brand, category_id, selling_price
      ) VALUES (
        v_accessory_code,
        v_line->>'name',
        v_line->>'brand',
        CASE WHEN v_line->>'category_id' IS NOT NULL THEN (v_line->>'category_id')::uuid ELSE NULL END,
        COALESCE((v_line->>'selling_price')::numeric, 0)
      ) RETURNING id INTO v_accessory_id;
    END IF;

    -- Create stock entry
    INSERT INTO accessory_stock_entries (
      accessory_id, supplier_id, receipt_id, quantity, unit_cost, total_cost,
      received_at, created_by
    ) VALUES (
      v_accessory_id, p_supplier_id, v_receipt_id, v_quantity, v_unit_cost,
      v_quantity * v_unit_cost, p_date_received, auth.uid()
    );

    -- Increment stock
    PERFORM increment_accessory_stock(v_accessory_id, v_quantity);

    v_total_items := v_total_items + v_quantity;
    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);

    v_entries := v_entries || jsonb_build_object(
      'accessory_id', v_accessory_id,
      'quantity', v_quantity,
      'unit_cost', v_unit_cost
    );
  END LOOP;

  -- Update receipt totals
  UPDATE intake_receipts
  SET total_items = v_total_items, total_cost = v_total_cost
  WHERE id = v_receipt_id;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'receipt_code', v_receipt_code,
    'total_items', v_total_items,
    'total_cost', v_total_cost,
    'entries', v_entries
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1K. Global shop toggle
INSERT INTO system_settings (key, value)
VALUES ('shop_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- 1L. RLS policies
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessory_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessory_stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessory_stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Staff full access
CREATE POLICY "Staff full access" ON accessories
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Staff full access" ON accessory_media
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Staff full access" ON accessory_stock_entries
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Staff full access" ON accessory_stock_adjustments
  FOR ALL USING (auth.role() = 'authenticated');

-- Public read for shop-visible accessories
CREATE POLICY "Public read active accessories" ON accessories
  FOR SELECT USING (shop_visible = true AND active = true);
CREATE POLICY "Public read accessory media" ON accessory_media
  FOR SELECT USING (true);

-- 1M. Storage bucket for accessory media
INSERT INTO storage.buckets (id, name, public)
VALUES ('accessory-media', 'accessory-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read accessory-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'accessory-media');
CREATE POLICY "Staff upload accessory-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'accessory-media' AND auth.role() = 'authenticated');
CREATE POLICY "Staff delete accessory-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'accessory-media' AND auth.role() = 'authenticated');
