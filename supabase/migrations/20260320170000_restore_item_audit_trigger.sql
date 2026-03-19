-- Restore the item audit trigger that was accidentally dropped
-- Also drop the old auto_populate_item_specs function

DROP FUNCTION IF EXISTS auto_populate_item_specs();

-- Recreate item audit trigger (tracks field-level changes to items)
CREATE OR REPLACE FUNCTION log_item_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
  tracked_cols text[] := ARRAY[
    'item_status', 'condition_grade', 'product_id', 'category_id',
    'brand', 'model_name', 'color', 'cpu', 'gpu', 'ram_gb', 'storage_gb',
    'screen_size', 'os_family', 'carrier', 'keyboard_layout', 'chipset',
    'ports', 'form_factor', 'year', 'other_features', 'device_category',
    'has_touchscreen', 'has_thunderbolt', 'supports_stylus', 'has_cellular',
    'is_unlocked', 'imei_slot_count', 'serial_number', 'imei', 'imei2',
    'purchase_price', 'selling_price', 'condition_notes',
    'battery_health_pct', 'short_description'
  ];
BEGIN
  FOREACH col IN ARRAY tracked_cols LOOP
    EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col) INTO new_val USING NEW;
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO item_audit_logs (item_id, field_name, old_value, new_value, changed_by, changed_by_email)
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

CREATE TRIGGER trg_item_audit
  AFTER UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION log_item_changes();
