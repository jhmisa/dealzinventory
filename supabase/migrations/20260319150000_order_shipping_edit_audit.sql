-- 1. Add shipping/tracking fields to orders
ALTER TABLE orders ADD COLUMN shipped_date timestamptz;
ALTER TABLE orders ADD COLUMN tracking_number text;

-- 2. Create order_audit_logs table
CREATE TABLE order_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_email text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_audit_logs_order ON order_audit_logs(order_id);
CREATE INDEX idx_order_audit_logs_created ON order_audit_logs(created_at DESC);

-- RLS
ALTER TABLE order_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access to order_audit_logs"
  ON order_audit_logs FOR ALL
  USING (auth.role() = 'authenticated');

-- 3. Trigger function for orders table
CREATE OR REPLACE FUNCTION log_order_changes()
RETURNS trigger AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
  tracked_cols text[] := ARRAY[
    'order_status', 'order_source', 'total_price', 'quantity',
    'shipping_cost', 'shipping_address', 'delivery_date', 'delivery_time_code',
    'notes', 'shipped_date', 'tracking_number'
  ];
  user_email text;
BEGIN
  -- Get current user email
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  FOREACH col IN ARRAY tracked_cols LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
      INTO old_val, new_val
      USING OLD, NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO order_audit_logs (order_id, field_name, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.id, col, old_val, new_val, auth.uid(), user_email);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_order_audit
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_order_changes();

-- 4. Trigger function for order_items table
CREATE OR REPLACE FUNCTION log_order_item_changes()
RETURNS trigger AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
  tracked_cols text[] := ARRAY['unit_price', 'discount', 'quantity', 'description'];
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  FOREACH col IN ARRAY tracked_cols LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
      INTO old_val, new_val
      USING OLD, NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO order_audit_logs (order_id, order_item_id, field_name, old_value, new_value, changed_by, changed_by_email)
      VALUES (NEW.order_id, NEW.id, col, old_val, new_val, auth.uid(), user_email);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_order_item_audit
  AFTER UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION log_order_item_changes();

-- 5. Log order_item inserts/deletes
CREATE OR REPLACE FUNCTION log_order_item_insert()
RETURNS trigger AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO order_audit_logs (order_id, order_item_id, field_name, old_value, new_value, changed_by, changed_by_email)
  VALUES (NEW.order_id, NEW.id, 'item_added', NULL, COALESCE(NEW.description, 'Item'), auth.uid(), user_email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_order_item_insert_audit
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION log_order_item_insert();

CREATE OR REPLACE FUNCTION log_order_item_delete()
RETURNS trigger AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO order_audit_logs (order_id, order_item_id, field_name, old_value, new_value, changed_by, changed_by_email)
  VALUES (OLD.order_id, OLD.id, 'item_removed', COALESCE(OLD.description, 'Item'), NULL, auth.uid(), user_email);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_order_item_delete_audit
  AFTER DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION log_order_item_delete();
