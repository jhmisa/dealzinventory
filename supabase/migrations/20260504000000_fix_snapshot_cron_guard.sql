-- Fix:
-- 1. pg_cron guard: interval '1 minute' → '1 day' (was always skipping)
-- 2. Column reference: i.product_model_id → i.product_id (column was renamed)
-- 3. FK ordering: insert snapshot summary first, then items, then update summary

CREATE OR REPLACE FUNCTION generate_inventory_snapshot(p_date DATE DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_date DATE;
  v_period_label TEXT;
  v_snapshot_id UUID;
  v_existing_id UUID;

  -- Item aggregates
  v_total_items INTEGER := 0;
  v_total_purchase NUMERIC(12,0) := 0;
  v_total_additional NUMERIC(12,0) := 0;
  v_total_item_value NUMERIC(12,0) := 0;

  -- Accessory aggregates
  v_total_acc_skus INTEGER := 0;
  v_total_acc_units INTEGER := 0;
  v_total_acc_value NUMERIC(12,0) := 0;

  -- Breakdowns
  v_by_status JSONB := '{}'::jsonb;
  v_by_brand JSONB := '{}'::jsonb;
  v_by_source JSONB := '{}'::jsonb;
  v_by_grade JSONB := '{}'::jsonb;
BEGIN
  -- Determine snapshot date
  IF p_date IS NOT NULL THEN
    v_snapshot_date := p_date;
  ELSE
    -- Last day of current month
    v_snapshot_date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  END IF;

  -- When called by cron (no explicit date), verify it's actually the last day
  IF p_date IS NULL THEN
    IF date_trunc('month', now() + interval '1 day') = date_trunc('month', now()) THEN
      -- Not the last day of the month; skip silently
      RETURN NULL;
    END IF;
  END IF;

  v_period_label := to_char(v_snapshot_date, 'FMMonth YYYY');

  -- Check if snapshot already exists for this date
  SELECT id INTO v_existing_id
    FROM inventory_snapshots
   WHERE snapshot_date = v_snapshot_date;

  IF v_existing_id IS NOT NULL THEN
    IF p_date IS NOT NULL THEN
      -- Manual call: delete old snapshot so we regenerate fresh
      DELETE FROM inventory_snapshot_items WHERE snapshot_id = v_existing_id;
      DELETE FROM inventory_snapshots WHERE id = v_existing_id;
    ELSE
      RETURN v_existing_id;
    END IF;
  END IF;

  v_snapshot_id := gen_random_uuid();

  -- -------------------------------------------------------
  -- Insert summary row first (satisfies FK for snapshot_items)
  -- -------------------------------------------------------
  INSERT INTO inventory_snapshots (
    id, snapshot_date, period_label,
    total_items, total_purchase_cost, total_additional_costs, total_inventory_value,
    total_accessory_skus, total_accessory_units, total_accessory_value,
    grand_total,
    summary_by_status, summary_by_brand, summary_by_source, summary_by_grade,
    generated_by
  ) VALUES (
    v_snapshot_id, v_snapshot_date, v_period_label,
    0, 0, 0, 0,
    0, 0, 0,
    0,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    auth.uid()
  );

  -- -------------------------------------------------------
  -- Insert item line-items
  -- -------------------------------------------------------
  INSERT INTO inventory_snapshot_items (
    snapshot_id, item_code, item_type, brand, model_name,
    condition_grade, item_status, source_type,
    purchase_price, additional_costs, total_cost
  )
  SELECT
    v_snapshot_id,
    i.item_code,
    'item',
    COALESCE(pm.brand, i.brand),
    COALESCE(pm.model_name, i.model_name),
    i.condition_grade::text,
    i.item_status::text,
    i.source_type::text,
    COALESCE(i.purchase_price, 0),
    COALESCE(costs.total_additional, 0),
    COALESCE(i.purchase_price, 0) + COALESCE(costs.total_additional, 0)
  FROM items i
  LEFT JOIN product_models pm ON pm.id = i.product_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ic.amount), 0) AS total_additional
      FROM item_costs ic
     WHERE ic.item_id = i.id
  ) costs ON true
  WHERE i.item_status IN ('INTAKE', 'AVAILABLE', 'RESERVED', 'REPAIR')
    AND (i.condition_grade IS NULL OR i.condition_grade != 'J');

  -- Compute item aggregates
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(purchase_price), 0),
    COALESCE(SUM(additional_costs), 0),
    COALESCE(SUM(total_cost), 0)
  INTO v_total_items, v_total_purchase, v_total_additional, v_total_item_value
  FROM inventory_snapshot_items
  WHERE snapshot_id = v_snapshot_id AND item_type = 'item';

  -- -------------------------------------------------------
  -- Insert accessory line-items
  -- -------------------------------------------------------
  INSERT INTO inventory_snapshot_items (
    snapshot_id, item_code, item_type, brand, model_name,
    item_status, purchase_price, additional_costs, total_cost,
    stock_quantity, unit_cost
  )
  SELECT
    v_snapshot_id,
    a.accessory_code,
    'accessory',
    a.brand,
    a.name,
    'AVAILABLE',
    COALESCE(se.weighted_unit_cost * a.stock_quantity, 0),
    0,
    COALESCE(se.weighted_unit_cost * a.stock_quantity, 0),
    a.stock_quantity,
    COALESCE(se.weighted_unit_cost, 0)
  FROM accessories a
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN SUM(e.quantity) > 0
           THEN SUM(e.total_cost) / SUM(e.quantity)
           ELSE 0
      END AS weighted_unit_cost
    FROM accessory_stock_entries e
    WHERE e.accessory_id = a.id
  ) se ON true
  WHERE a.active = true AND a.stock_quantity > 0;

  -- Compute accessory aggregates
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(stock_quantity), 0)::integer,
    COALESCE(SUM(total_cost), 0)
  INTO v_total_acc_skus, v_total_acc_units, v_total_acc_value
  FROM inventory_snapshot_items
  WHERE snapshot_id = v_snapshot_id AND item_type = 'accessory';

  -- -------------------------------------------------------
  -- Build breakdowns (items only)
  -- -------------------------------------------------------
  SELECT COALESCE(jsonb_object_agg(item_status, jsonb_build_object('count', cnt, 'value', val)), '{}'::jsonb)
    INTO v_by_status
    FROM (
      SELECT item_status, COUNT(*) AS cnt, SUM(total_cost) AS val
        FROM inventory_snapshot_items
       WHERE snapshot_id = v_snapshot_id AND item_type = 'item'
       GROUP BY item_status
    ) s;

  SELECT COALESCE(jsonb_object_agg(COALESCE(brand, 'Unknown'), jsonb_build_object('count', cnt, 'value', val)), '{}'::jsonb)
    INTO v_by_brand
    FROM (
      SELECT brand, COUNT(*) AS cnt, SUM(total_cost) AS val
        FROM inventory_snapshot_items
       WHERE snapshot_id = v_snapshot_id AND item_type = 'item'
       GROUP BY brand
    ) s;

  SELECT COALESCE(jsonb_object_agg(COALESCE(source_type, 'Unknown'), jsonb_build_object('count', cnt, 'value', val)), '{}'::jsonb)
    INTO v_by_source
    FROM (
      SELECT source_type, COUNT(*) AS cnt, SUM(total_cost) AS val
        FROM inventory_snapshot_items
       WHERE snapshot_id = v_snapshot_id AND item_type = 'item'
       GROUP BY source_type
    ) s;

  SELECT COALESCE(jsonb_object_agg(COALESCE(condition_grade, 'Ungraded'), jsonb_build_object('count', cnt, 'value', val)), '{}'::jsonb)
    INTO v_by_grade
    FROM (
      SELECT condition_grade, COUNT(*) AS cnt, SUM(total_cost) AS val
        FROM inventory_snapshot_items
       WHERE snapshot_id = v_snapshot_id AND item_type = 'item'
       GROUP BY condition_grade
    ) s;

  -- -------------------------------------------------------
  -- Update summary row with computed aggregates
  -- -------------------------------------------------------
  UPDATE inventory_snapshots SET
    total_items = v_total_items,
    total_purchase_cost = v_total_purchase,
    total_additional_costs = v_total_additional,
    total_inventory_value = v_total_item_value,
    total_accessory_skus = v_total_acc_skus,
    total_accessory_units = v_total_acc_units,
    total_accessory_value = v_total_acc_value,
    grand_total = v_total_item_value + v_total_acc_value,
    summary_by_status = v_by_status,
    summary_by_brand = v_by_brand,
    summary_by_source = v_by_source,
    summary_by_grade = v_by_grade
  WHERE id = v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;
