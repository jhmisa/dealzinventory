-- Drop ALL triggers on items that might be doing product auto-population
-- except our known triggers (trg_items_updated, trg_auto_populate_from_product)

-- Try all likely trigger names the old trigger might have
DROP TRIGGER IF EXISTS trg_populate_item_from_product ON items;
DROP TRIGGER IF EXISTS trg_item_product_assignment ON items;
DROP TRIGGER IF EXISTS trg_auto_fill_from_product ON items;
DROP TRIGGER IF EXISTS trg_copy_product_fields ON items;
DROP TRIGGER IF EXISTS trg_sync_product_fields ON items;
DROP TRIGGER IF EXISTS trg_product_to_item ON items;
DROP TRIGGER IF EXISTS trg_item_populate ON items;
DROP TRIGGER IF EXISTS populate_item_from_product ON items;
DROP TRIGGER IF EXISTS auto_populate_from_product ON items;
DROP TRIGGER IF EXISTS sync_item_from_product ON items;
DROP TRIGGER IF EXISTS item_product_sync ON items;
DROP TRIGGER IF EXISTS on_product_assigned ON items;
DROP TRIGGER IF EXISTS before_item_update_product ON items;
DROP TRIGGER IF EXISTS item_before_update ON items;
DROP TRIGGER IF EXISTS trg_item_before_update ON items;

-- Also drop old function names
DROP FUNCTION IF EXISTS populate_item_from_product();
DROP FUNCTION IF EXISTS sync_item_from_product();
DROP FUNCTION IF EXISTS copy_product_fields();
DROP FUNCTION IF EXISTS item_product_sync();
DROP FUNCTION IF EXISTS on_product_assigned();

-- Now use DO block to find and drop ANY remaining trigger that calls a function
-- containing 'product' in its name (except our own)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname, p.proname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname = 'items'
      AND NOT t.tgisinternal
      AND t.tgname != 'trg_items_updated'
      AND t.tgname != 'trg_auto_populate_from_product'
  LOOP
    RAISE NOTICE 'Dropping trigger % (function: %)', r.tgname, r.proname;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON items', r.tgname);
  END LOOP;
END;
$$;
