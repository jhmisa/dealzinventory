-- Convert customers.shipping_address from text to jsonb
-- Existing data preserved in freeform_legacy wrapper
ALTER TABLE customers
  ALTER COLUMN shipping_address TYPE jsonb USING
    CASE
      WHEN shipping_address IS NOT NULL AND shipping_address != ''
      THEN jsonb_build_object('country', 'JP', 'freeform_legacy', shipping_address)
      ELSE NULL
    END;
