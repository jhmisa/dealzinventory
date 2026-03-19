-- Temporary debug function to list triggers on items table
CREATE OR REPLACE FUNCTION debug_list_triggers()
RETURNS TABLE(trigger_name text, function_name text, event text, timing text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    t.tgname::text as trigger_name,
    p.proname::text as function_name,
    CASE
      WHEN t.tgtype & 4 > 0 THEN 'INSERT'
      WHEN t.tgtype & 8 > 0 THEN 'DELETE'
      WHEN t.tgtype & 16 > 0 THEN 'UPDATE'
      ELSE 'OTHER'
    END as event,
    CASE
      WHEN t.tgtype & 2 > 0 THEN 'BEFORE'
      WHEN t.tgtype & 1 > 0 THEN 'AFTER'
      ELSE 'INSTEAD OF'
    END as timing
  FROM pg_trigger t
  JOIN pg_proc p ON t.tgfoid = p.oid
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'items'
    AND NOT t.tgisinternal
  ORDER BY t.tgname;
$$;

-- Also: check for empty strings in numeric columns of product_models
CREATE OR REPLACE FUNCTION debug_check_product_numeric_fields(p_product_id uuid)
RETURNS TABLE(field_name text, raw_value text, field_type text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 'ram_gb' as field_name, ram_gb::text as raw_value, pg_typeof(ram_gb)::text as field_type FROM product_models WHERE id = p_product_id
  UNION ALL
  SELECT 'storage_gb', storage_gb::text, pg_typeof(storage_gb)::text FROM product_models WHERE id = p_product_id
  UNION ALL
  SELECT 'year', year::text, pg_typeof(year)::text FROM product_models WHERE id = p_product_id
  UNION ALL
  SELECT 'imei_slot_count', imei_slot_count::text, pg_typeof(imei_slot_count)::text FROM product_models WHERE id = p_product_id
;
$$;
