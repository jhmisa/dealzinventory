-- Rename customer_code prefix from CUST to C
-- e.g. CUST000015 → C000015
UPDATE customers
SET customer_code = 'C' || substring(customer_code FROM 5)
WHERE customer_code LIKE 'CUST%';
