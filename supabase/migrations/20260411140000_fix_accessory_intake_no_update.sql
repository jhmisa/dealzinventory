-- Fix: rewrite create_accessory_intake_batch to avoid UPDATE on intake_receipts.
-- The table has a trigger enforcing immutability on updates.
-- Solution: pre-compute totals, process line items into temp structures,
-- then do a single INSERT with correct totals, followed by stock entry inserts.

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

  -- Temp arrays to hold line item data for deferred stock entry inserts
  v_accessory_ids uuid[] := '{}';
  v_quantities integer[] := '{}';
  v_unit_costs numeric[] := '{}';
  v_i integer;
BEGIN
  -- Phase 1: Process line items — create accessories, compute totals
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    v_quantity := (v_line->>'quantity')::integer;
    v_unit_cost := (v_line->>'unit_cost')::numeric;

    IF v_line->>'accessory_id' IS NOT NULL THEN
      v_accessory_id := (v_line->>'accessory_id')::uuid;
    ELSE
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

    -- Increment stock
    PERFORM increment_accessory_stock(v_accessory_id, v_quantity);

    v_total_items := v_total_items + v_quantity;
    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);

    -- Store for deferred stock entry insert
    v_accessory_ids := v_accessory_ids || v_accessory_id;
    v_quantities := v_quantities || v_quantity;
    v_unit_costs := v_unit_costs || v_unit_cost;

    v_entries := v_entries || jsonb_build_object(
      'accessory_id', v_accessory_id,
      'quantity', v_quantity,
      'unit_cost', v_unit_cost
    );
  END LOOP;

  -- Phase 2: Create receipt with correct totals (single INSERT, no UPDATE)
  SELECT generate_code('RCV', 'rcv_code_seq') INTO v_receipt_code;

  INSERT INTO intake_receipts (
    receipt_code, supplier_id, source_type, date_received,
    invoice_file_url, supplier_contact_snapshot, notes,
    total_items, total_cost, created_by
  ) VALUES (
    v_receipt_code, p_supplier_id, 'WHOLESALE', p_date_received,
    p_invoice_file_url, p_supplier_contact_snapshot, p_notes,
    v_total_items, v_total_cost, auth.uid()
  ) RETURNING id INTO v_receipt_id;

  -- Phase 3: Create stock entries with receipt_id
  FOR v_i IN 1..array_length(v_accessory_ids, 1) LOOP
    INSERT INTO accessory_stock_entries (
      accessory_id, supplier_id, receipt_id, quantity, unit_cost, total_cost,
      received_at, created_by
    ) VALUES (
      v_accessory_ids[v_i], p_supplier_id, v_receipt_id, v_quantities[v_i], v_unit_costs[v_i],
      v_quantities[v_i] * v_unit_costs[v_i], p_date_received, auth.uid()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'receipt_code', v_receipt_code,
    'total_items', v_total_items,
    'total_cost', v_total_cost,
    'entries', v_entries
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
