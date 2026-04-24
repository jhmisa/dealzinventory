-- Add receiver fields to customer_addresses
ALTER TABLE customer_addresses
  ADD COLUMN receiver_first_name text,
  ADD COLUMN receiver_last_name text,
  ADD COLUMN receiver_phone text;

-- Migrate existing care_of data to receiver_last_name (best-effort)
UPDATE customer_addresses
SET receiver_last_name = care_of
WHERE care_of IS NOT NULL AND care_of != '';

-- Drop care_of column
ALTER TABLE customer_addresses DROP COLUMN care_of;

-- Re-label existing addresses as "Address 1", "Address 2", etc. per customer
WITH numbered AS (
  SELECT id, customer_id,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) AS rn
  FROM customer_addresses
)
UPDATE customer_addresses ca
SET label = 'Address ' || n.rn
FROM numbered n
WHERE ca.id = n.id;

-- Add index for receiver name search
CREATE INDEX idx_customer_addresses_receiver_name
  ON customer_addresses (receiver_last_name, receiver_first_name);

-- Add receiver fields to orders (snapshotted at order creation)
ALTER TABLE orders
  ADD COLUMN receiver_first_name text,
  ADD COLUMN receiver_last_name text,
  ADD COLUMN receiver_phone text;
