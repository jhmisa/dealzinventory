-- Clear all test/transactional data for real data upload
-- Preserves: categories, product_models, config_groups, product_media,
--   photo_groups, photo_group_media, kaitori_price_list, item_list_column_settings,
--   ai_configurations, ai_prompts, system_settings, staff_profiles, postal_codes

BEGIN;

-- 1. Return system
TRUNCATE return_request_media, return_request_items, return_requests CASCADE;

-- 2. Order system
TRUNCATE order_audit_logs, order_items, orders CASCADE;

-- 3. Offers
TRUNCATE offer_items, offers CASCADE;

-- 4. Sell groups
TRUNCATE sell_group_items, sell_groups CASCADE;

-- 5. Item data (CASCADE handles item_defects, item_costs, item_media, item_audit_logs)
TRUNCATE item_audit_logs, item_defects, item_costs, item_media, items CASCADE;

-- 6. Intake receipts
TRUNCATE intake_adjustments, intake_receipt_line_items, intake_receipts CASCADE;

-- 7. Kaitori requests
TRUNCATE kaitori_request_media, kaitori_requests CASCADE;

-- 8. Customers
TRUNCATE customer_addresses, customers CASCADE;

-- 9. Suppliers
TRUNCATE suppliers CASCADE;

-- 10. Reset code sequences (skip any that don't exist)
DO $$
DECLARE
  seq_name text;
BEGIN
  FOR seq_name IN
    SELECT unnest(ARRAY[
      'p_code_seq', 'pg_code_seq', 'g_code_seq', 'kt_code_seq',
      'ord_code_seq', 'cust_code_seq', 'ofr_code_seq', 'adj_code_seq', 'ret_code_seq'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = seq_name) THEN
      EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq_name);
      RAISE NOTICE 'Reset sequence: %', seq_name;
    ELSE
      RAISE NOTICE 'Sequence not found, skipping: %', seq_name;
    END IF;
  END LOOP;
END
$$;

COMMIT;
