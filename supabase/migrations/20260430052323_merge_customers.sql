-- Merge Customers feature: audit log table + atomic RPC function

-- A) customer_merge_logs table
CREATE TABLE customer_merge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_customer_id uuid NOT NULL REFERENCES customers(id),
  merged_customer_ids uuid[] NOT NULL,
  merged_customer_codes text[] NOT NULL,
  merged_customer_names text[] NOT NULL,
  performed_by uuid,
  merged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_merge_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage merge logs"
  ON customer_merge_logs FOR ALL
  USING (auth.uid() IS NOT NULL);

-- B) merge_customers RPC function
CREATE OR REPLACE FUNCTION merge_customers(
  p_primary_id uuid,
  p_secondary_ids uuid[],
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_primary_code text;
  v_sec_id uuid;
  v_sec_codes text[] := '{}';
  v_sec_names text[] := '{}';
  v_sec_code text;
  v_sec_name text;
  v_primary_address_labels text[];
BEGIN
  -- Validate primary exists
  SELECT customer_code INTO v_primary_code
    FROM public.customers WHERE id = p_primary_id;
  IF v_primary_code IS NULL THEN
    RAISE EXCEPTION 'Primary customer not found: %', p_primary_id;
  END IF;

  -- Validate primary is not in secondary list
  IF p_primary_id = ANY(p_secondary_ids) THEN
    RAISE EXCEPTION 'Primary customer cannot be in the merge list';
  END IF;

  -- Collect audit data for each secondary and validate they exist
  FOREACH v_sec_id IN ARRAY p_secondary_ids LOOP
    SELECT customer_code,
           COALESCE(first_name, '') || ' ' || last_name
      INTO v_sec_code, v_sec_name
      FROM public.customers WHERE id = v_sec_id;

    IF v_sec_code IS NULL THEN
      RAISE EXCEPTION 'Secondary customer not found: %', v_sec_id;
    END IF;

    v_sec_codes := array_append(v_sec_codes, v_sec_code);
    v_sec_names := array_append(v_sec_names, trim(v_sec_name));
  END LOOP;

  -- Get existing address labels on primary (for deduplication)
  SELECT COALESCE(array_agg(label), '{}')
    INTO v_primary_address_labels
    FROM public.customer_addresses
    WHERE customer_id = p_primary_id;

  -- Reassign all FK references for each secondary
  FOREACH v_sec_id IN ARRAY p_secondary_ids LOOP
    UPDATE public.orders SET customer_id = p_primary_id WHERE customer_id = v_sec_id;
    UPDATE public.kaitori_requests SET customer_id = p_primary_id WHERE customer_id = v_sec_id;
    UPDATE public.conversations SET customer_id = p_primary_id WHERE customer_id = v_sec_id;
    UPDATE public.automated_message_queue SET customer_id = p_primary_id WHERE customer_id = v_sec_id;
    UPDATE public.tickets SET customer_id = p_primary_id WHERE customer_id = v_sec_id;
    UPDATE public.offers SET customer_id = p_primary_id WHERE customer_id = v_sec_id;

    -- Addresses: delete duplicates (same label), move the rest
    DELETE FROM public.customer_addresses
      WHERE customer_id = v_sec_id
        AND label = ANY(v_primary_address_labels);

    UPDATE public.customer_addresses
      SET customer_id = p_primary_id
      WHERE customer_id = v_sec_id;
  END LOOP;

  -- Insert merge log
  INSERT INTO public.customer_merge_logs (
    primary_customer_id, merged_customer_ids, merged_customer_codes,
    merged_customer_names, performed_by
  ) VALUES (
    p_primary_id, p_secondary_ids, v_sec_codes,
    v_sec_names, p_performed_by
  );

  -- Delete secondary customers
  FOREACH v_sec_id IN ARRAY p_secondary_ids LOOP
    DELETE FROM public.customers WHERE id = v_sec_id;
  END LOOP;

  RETURN jsonb_build_object(
    'merged_count', array_length(p_secondary_ids, 1),
    'primary_code', v_primary_code,
    'merged_codes', to_jsonb(v_sec_codes)
  );
END;
$$;
