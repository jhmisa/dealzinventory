-- Migration: Convert phone numbers to E.164 and copy shipping_address to customer_addresses

-- 1. Convert customers.phone to E.164 format

-- Japan mobile: 090/080/070/050 + 8 digits → +81 + drop leading 0
UPDATE customers
SET phone = '+81' || substring(phone from 2)
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone ~ '^0[5789]0\d{8}$';

-- Japan landline: 0[1-9]X... (10 digits total, not matching mobile) → +81 + drop leading 0
UPDATE customers
SET phone = '+81' || substring(phone from 2)
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone ~ '^0[1-9]\d{8}$'
  AND phone !~ '^0[5789]0';

-- Philippines mobile: 09[1-9]X + 11 digits total → +63 + drop leading 0
UPDATE customers
SET phone = '+63' || substring(phone from 2)
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone ~ '^09[1-9]\d{8}$';

-- 2. Convert receiver_phone in customer_addresses to E.164

-- Japan mobile
UPDATE customer_addresses
SET receiver_phone = '+81' || substring(receiver_phone from 2)
WHERE receiver_phone IS NOT NULL
  AND receiver_phone !~ '^\+'
  AND receiver_phone ~ '^0[5789]0\d{8}$';

-- Japan landline
UPDATE customer_addresses
SET receiver_phone = '+81' || substring(receiver_phone from 2)
WHERE receiver_phone IS NOT NULL
  AND receiver_phone !~ '^\+'
  AND receiver_phone ~ '^0[1-9]\d{8}$'
  AND receiver_phone !~ '^0[5789]0';

-- Philippines mobile
UPDATE customer_addresses
SET receiver_phone = '+63' || substring(receiver_phone from 2)
WHERE receiver_phone IS NOT NULL
  AND receiver_phone !~ '^\+'
  AND receiver_phone ~ '^09[1-9]\d{8}$';

-- 3. Copy shipping_address to customer_addresses for customers who don't already have entries

INSERT INTO customer_addresses (customer_id, address, label, is_default)
SELECT
  c.id,
  c.shipping_address::jsonb,
  'Address 1',
  true
FROM customers c
WHERE c.shipping_address IS NOT NULL
  AND c.shipping_address::text != 'null'
  AND c.shipping_address::text != ''
  AND NOT EXISTS (
    SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id
  );
