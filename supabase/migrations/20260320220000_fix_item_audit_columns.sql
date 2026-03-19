-- Fix item audit trigger: remove columns that don't exist on items table
-- Removed: chipset, ports, has_thunderbolt, supports_stylus, has_cellular, imei_slot_count

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
    'screen_size', 'os_family', 'carrier', 'keyboard_layout',
    'form_factor', 'year', 'other_features', 'device_category',
    'has_touchscreen', 'is_unlocked', 'imei', 'imei2',
    'purchase_price', 'selling_price', 'condition_notes',
    'battery_health_pct'
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
