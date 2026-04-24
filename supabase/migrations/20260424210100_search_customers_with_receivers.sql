-- RPC function to search customers by name/email/code AND by receiver names on addresses
CREATE OR REPLACE FUNCTION search_customers_with_receivers(query text)
RETURNS SETOF customers
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.*
  FROM customers c
  LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
  WHERE
    c.last_name ILIKE '%' || query || '%'
    OR c.first_name ILIKE '%' || query || '%'
    OR c.email ILIKE '%' || query || '%'
    OR c.customer_code ILIKE '%' || query || '%'
    OR ca.receiver_first_name ILIKE '%' || query || '%'
    OR ca.receiver_last_name ILIKE '%' || query || '%'
  ORDER BY c.created_at DESC;
$$;
