-- Inventory Snapshot tables for month-end inventory valuation reports

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  period_label TEXT NOT NULL,

  -- Item totals
  total_items INTEGER NOT NULL,
  total_purchase_cost NUMERIC(12,0) NOT NULL,
  total_additional_costs NUMERIC(12,0) NOT NULL,
  total_inventory_value NUMERIC(12,0) NOT NULL,

  -- Accessory totals
  total_accessory_skus INTEGER NOT NULL,
  total_accessory_units INTEGER NOT NULL,
  total_accessory_value NUMERIC(12,0) NOT NULL,

  -- Grand total
  grand_total NUMERIC(12,0) NOT NULL,

  -- Breakdowns (JSONB)
  summary_by_status JSONB NOT NULL,
  summary_by_brand JSONB NOT NULL,
  summary_by_source JSONB NOT NULL,
  summary_by_grade JSONB NOT NULL,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_snapshot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES inventory_snapshots(id) ON DELETE CASCADE,

  item_code TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'item',

  brand TEXT,
  model_name TEXT,
  condition_grade TEXT,
  item_status TEXT NOT NULL,
  source_type TEXT,

  purchase_price NUMERIC(10,0) NOT NULL DEFAULT 0,
  additional_costs NUMERIC(10,0) NOT NULL DEFAULT 0,
  total_cost NUMERIC(10,0) NOT NULL DEFAULT 0,

  stock_quantity INTEGER,
  unit_cost NUMERIC(10,0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshot_items_snapshot ON inventory_snapshot_items(snapshot_id);

-- ============================================================
-- 2. RLS
-- ============================================================

ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshot_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff full access on inventory_snapshots"
  ON inventory_snapshots FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Staff full access on inventory_snapshot_items"
  ON inventory_snapshot_items FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. generate_inventory_snapshot() function
-- ============================================================

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
    IF date_trunc('month', now() + interval '1 minute') = date_trunc('month', now()) THEN
      -- Not the last day of the month; skip silently
      RETURN NULL;
    END IF;
  END IF;

  v_period_label := to_char(v_snapshot_date, 'FMMonth YYYY');

  -- Idempotent: skip if snapshot already exists
  SELECT id INTO v_existing_id
    FROM inventory_snapshots
   WHERE snapshot_date = v_snapshot_date;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  v_snapshot_id := gen_random_uuid();

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
  LEFT JOIN product_models pm ON pm.id = i.product_model_id
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
  -- Insert summary row
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
    v_total_items, v_total_purchase, v_total_additional, v_total_item_value,
    v_total_acc_skus, v_total_acc_units, v_total_acc_value,
    v_total_item_value + v_total_acc_value,
    v_by_status, v_by_brand, v_by_source, v_by_grade,
    auth.uid()
  );

  RETURN v_snapshot_id;
END;
$$;

-- ============================================================
-- 4. pg_cron schedule (last day of each month at 23:59:59 JST = 14:59:59 UTC)
-- ============================================================

SELECT cron.schedule(
  'monthly-inventory-snapshot',
  '59 14 28-31 * *',
  $$SELECT generate_inventory_snapshot()$$
);
