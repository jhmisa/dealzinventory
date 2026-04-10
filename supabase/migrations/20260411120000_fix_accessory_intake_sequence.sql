-- Fix: create missing intake_receipts table and rcv_code_seq sequence
-- The create_accessory_intake_batch function references both but neither
-- was created in the original accessory inventory migration.

-- 1. Create the rcv_code_seq sequence
CREATE SEQUENCE IF NOT EXISTS rcv_code_seq START 1;

-- 2. Create the intake_receipts table
CREATE TABLE IF NOT EXISTS intake_receipts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code              text NOT NULL UNIQUE,
  supplier_id               uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  source_type               text NOT NULL,
  date_received             date NOT NULL,
  invoice_file_url          text,
  supplier_contact_snapshot text,
  notes                     text,
  total_items               integer NOT NULL DEFAULT 0,
  total_cost                numeric(10,0) NOT NULL DEFAULT 0,
  created_by                uuid REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_intake_receipts_updated BEFORE UPDATE ON intake_receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_intake_receipts_code ON intake_receipts (receipt_code);
CREATE INDEX idx_intake_receipts_supplier ON intake_receipts (supplier_id);
CREATE INDEX idx_intake_receipts_date ON intake_receipts (date_received);

-- 3. RLS + staff access policy
ALTER TABLE intake_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff full access" ON intake_receipts
  FOR ALL USING (auth.role() = 'authenticated');
