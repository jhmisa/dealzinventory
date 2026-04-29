-- ============================================================
-- Ticketing System Migration
-- ============================================================

-- 0. Helper function (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Enums
CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');
CREATE TYPE ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- 2. ticket_types (extensible reference table)
CREATE TABLE ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'circle',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed initial types
INSERT INTO ticket_types (name, slug, label, icon, sort_order) VALUES
  ('RETURN', 'return', 'Return', 'rotate-ccw', 1),
  ('STOCK_REQUEST', 'stock-request', 'Stock Request', 'package-search', 2),
  ('DELIVERY', 'delivery', 'Delivery Issue', 'truck', 3),
  ('COMPLAINT', 'complaint', 'Complaint', 'alert-triangle', 4),
  ('GENERAL', 'general', 'General Inquiry', 'help-circle', 5);

-- 3. Sequence & code generation
CREATE SEQUENCE tk_code_seq START 1;

-- 4. tickets
CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code text NOT NULL UNIQUE,
  ticket_type_id uuid NOT NULL REFERENCES ticket_types(id),
  ticket_status ticket_status NOT NULL DEFAULT 'OPEN',
  priority ticket_priority NOT NULL DEFAULT 'NORMAL',
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_id uuid REFERENCES orders(id),
  conversation_id uuid REFERENCES conversations(id),
  assigned_staff_id uuid REFERENCES auth.users(id),
  subject text NOT NULL,
  description text NOT NULL,
  resolution_notes text,
  created_by_role text NOT NULL DEFAULT 'staff' CHECK (created_by_role IN ('staff', 'customer')),
  return_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

-- 5. ticket_media
CREATE TABLE ticket_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  sort_order integer DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- 6. ticket_notes (staff notes + activity log)
CREATE TABLE ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES auth.users(id),
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'note' CHECK (note_type IN ('note', 'status_change', 'assignment', 'system')),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Indexes
CREATE INDEX idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX idx_tickets_order_id ON tickets(order_id);
CREATE INDEX idx_tickets_conversation_id ON tickets(conversation_id);
CREATE INDEX idx_tickets_ticket_status ON tickets(ticket_status);
CREATE INDEX idx_tickets_ticket_type_id ON tickets(ticket_type_id);
CREATE INDEX idx_tickets_assigned_staff_id ON tickets(assigned_staff_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_ticket_notes_ticket_id ON ticket_notes(ticket_id);
CREATE INDEX idx_ticket_media_ticket_id ON ticket_media(ticket_id);

-- 8. Updated_at trigger
CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 9. RLS Policies

-- ticket_types: public read, staff write
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active ticket types"
  ON ticket_types FOR SELECT
  USING (true);

CREATE POLICY "Staff can manage ticket types"
  ON ticket_types FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- tickets: staff full CRUD
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage tickets"
  ON tickets FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ticket_media: staff full CRUD
ALTER TABLE ticket_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage ticket media"
  ON ticket_media FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ticket_notes: staff only
ALTER TABLE ticket_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage ticket notes"
  ON ticket_notes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 10. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-media', 'ticket-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read ticket media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-media');

CREATE POLICY "Authenticated upload ticket media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ticket-media' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete ticket media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ticket-media' AND auth.role() = 'authenticated');
