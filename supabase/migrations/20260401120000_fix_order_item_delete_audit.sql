-- Fix: order item delete audit trigger was inserting a reference to the
-- already-deleted order_items row, causing an FK constraint violation.
-- Solution: use NULL for order_item_id in the delete audit log entry.

CREATE OR REPLACE FUNCTION log_order_item_delete()
RETURNS trigger AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO order_audit_logs (order_id, order_item_id, field_name, old_value, new_value, changed_by, changed_by_email)
  VALUES (OLD.order_id, NULL, 'item_removed', COALESCE(OLD.description, 'Item'), NULL, auth.uid(), user_email);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
