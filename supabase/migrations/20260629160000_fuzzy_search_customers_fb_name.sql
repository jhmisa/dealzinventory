-- Add fb_name (Facebook display name) to the customer fuzzy-search haystack so staff can
-- find a buyer by their Messenger name. Same shape as 20260629140000; only the haystack
-- gains c.fb_name. Benefits both the Customers page and the messaging customer-linker.
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
            c.customer_code, c.last_name, c.first_name, c.email, c.phone, c.fb_name,
            ca.receiver_first_name, ca.receiver_last_name
          ),
          query
        )
  ORDER BY c.created_at DESC;
$$;
