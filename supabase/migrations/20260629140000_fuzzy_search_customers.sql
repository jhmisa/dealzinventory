-- Route customer search through the shared fuzzy engine (search_matches) so staff can
-- find a customer regardless of spacing/dashes in the code, name, or phone. Same fields
-- as before (customer + receiver names on addresses); only the matching changes.
CREATE OR REPLACE FUNCTION search_customers_with_receivers(query text)
RETURNS SETOF customers
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.*
  FROM customers c
  LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
  WHERE public.search_matches(
          concat_ws(' ',
            c.customer_code, c.last_name, c.first_name, c.email, c.phone,
            ca.receiver_first_name, ca.receiver_last_name
          ),
          query
        )
  ORDER BY c.created_at DESC;
$$;
