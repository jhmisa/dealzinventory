-- Add PAYPAL to payment_method options
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('COD','CREDIT_CARD','BANK','KONBINI','CASH','PAYPAL'));

-- Payment confirmations table
CREATE TABLE payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),  -- JPY, no decimals
  screenshot_url text NOT NULL,                 -- storage path in payment-proofs bucket
  notes text,
  confirmed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_confirmations_order ON payment_confirmations(order_id);

-- RLS
ALTER TABLE payment_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read" ON payment_confirmations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON payment_confirmations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can delete" ON payment_confirmations FOR DELETE TO authenticated USING (true);

-- Private storage bucket (signed URLs for access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff upload payment proofs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-proofs');
CREATE POLICY "Staff read payment proofs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'payment-proofs');
CREATE POLICY "Staff delete payment proofs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-proofs');
