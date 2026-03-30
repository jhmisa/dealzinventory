-- Add print tracking and box count columns to orders
ALTER TABLE orders
  ADD COLUMN invoice_printed_at timestamptz,
  ADD COLUMN dempyo_printed_at timestamptz,
  ADD COLUMN delivery_box_count integer NOT NULL DEFAULT 1;

-- Create system_settings key-value table
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Staff can read and update settings
CREATE POLICY "Staff can read settings"
  ON system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can update settings"
  ON system_settings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert settings"
  ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed default credit card surcharge
INSERT INTO system_settings (key, value, description)
VALUES ('credit_card_surcharge_pct', '4', 'Credit card surcharge percentage added to COD orders paid by credit card')
ON CONFLICT (key) DO NOTHING;
