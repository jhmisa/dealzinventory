-- Supplier Returns & Inventory Removals
-- New tables and enums for tracking items returned to suppliers and removed from inventory

-- === Enums ===

CREATE TYPE supplier_return_status AS ENUM ('REQUESTED', 'RETURNED', 'RESOLVED');
CREATE TYPE supplier_return_resolution AS ENUM ('EXCHANGE', 'REFUND');
CREATE TYPE refund_payment_method AS ENUM ('BANK_TRANSFER', 'CASH');
CREATE TYPE inventory_removal_reason AS ENUM ('MISSING', 'OFFICE_USE', 'DAMAGED', 'GIFTED', 'OTHER');
CREATE TYPE inventory_removal_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Add new values to item_status enum
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'REMOVED';

-- === Sequences ===

CREATE SEQUENCE IF NOT EXISTS sr_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS rm_code_seq START 1;

-- === supplier_returns table ===

CREATE TABLE supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_code text UNIQUE NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  intake_receipt_id uuid REFERENCES intake_receipts(id) ON DELETE SET NULL,
  receipt_file_url text,
  reason text NOT NULL,
  return_status supplier_return_status NOT NULL DEFAULT 'REQUESTED',
  resolution supplier_return_resolution,
  refund_amount numeric(10,0),
  refund_payment_method refund_payment_method,
  refund_received boolean DEFAULT false,
  refund_received_at timestamptz,
  staff_notes text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_supplier_returns_updated_at
  BEFORE UPDATE ON supplier_returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_supplier_returns_item_id ON supplier_returns(item_id);
CREATE INDEX idx_supplier_returns_status ON supplier_returns(return_status);
CREATE INDEX idx_supplier_returns_supplier_id ON supplier_returns(supplier_id);

-- === inventory_removals table ===

CREATE TABLE inventory_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  removal_code text UNIQUE NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  reason inventory_removal_reason NOT NULL,
  reason_text text,
  notes text,
  removal_status inventory_removal_status NOT NULL DEFAULT 'PENDING',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_inventory_removals_updated_at
  BEFORE UPDATE ON inventory_removals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_inventory_removals_item_id ON inventory_removals(item_id);
CREATE INDEX idx_inventory_removals_status ON inventory_removals(removal_status);

-- === RLS Policies ===

ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_removals ENABLE ROW LEVEL SECURITY;

-- Authenticated staff can read/write
CREATE POLICY "Staff can read supplier_returns"
  ON supplier_returns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert supplier_returns"
  ON supplier_returns FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Staff can update supplier_returns"
  ON supplier_returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Staff can read inventory_removals"
  ON inventory_removals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert inventory_removals"
  ON inventory_removals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Staff can update inventory_removals"
  ON inventory_removals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
