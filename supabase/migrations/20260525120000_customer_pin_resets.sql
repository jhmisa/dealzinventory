-- Customer self-service PIN reset tokens.
--
-- The customer-auth Edge Function (forgot_pin_request / forgot_pin_complete actions)
-- issues a 6-digit code by email, stores it hashed here, and verifies it on completion.
-- Only the service-role Edge Function ever touches this table — anon clients should
-- not be able to read or write it, so RLS is enabled with no permissive policies.

CREATE TABLE IF NOT EXISTS customer_pin_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_pin_resets_customer_open_idx
  ON customer_pin_resets(customer_id)
  WHERE used_at IS NULL;

ALTER TABLE customer_pin_resets ENABLE ROW LEVEL SECURITY;
