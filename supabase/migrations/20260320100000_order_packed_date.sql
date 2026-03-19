-- Add packed_date to orders for tracking when an order was packed
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_date timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_by uuid REFERENCES auth.users(id);

-- Add packed_date to the audit trigger's tracked columns
CREATE OR REPLACE FUNCTION log_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
  tracked_cols text[] := ARRAY[
    'order_status', 'order_source', 'total_price', 'quantity',
    'shipping_cost', 'shipping_address', 'delivery_date', 'delivery_time_code',
    'notes', 'shipped_date', 'tracking_number', 'packed_date', 'packed_by'
  ];
BEGIN
  FOREACH col IN ARRAY tracked_cols LOOP
    EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col) INTO new_val USING NEW;
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO order_audit_logs (order_id, field_name, old_value, new_value, changed_by, changed_by_email)
      VALUES (
        NEW.id,
        col,
        old_val,
        new_val,
        auth.uid(),
        (SELECT email FROM auth.users WHERE id = auth.uid())
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
