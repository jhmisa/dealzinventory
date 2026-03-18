-- 1. Expand order_source enum
ALTER TYPE order_source ADD VALUE 'WALK_IN';
ALTER TYPE order_source ADD VALUE 'FB';
ALTER TYPE order_source ADD VALUE 'YOUTUBE';

-- 2. New columns on orders
ALTER TABLE orders ADD COLUMN delivery_date date;
ALTER TABLE orders ADD COLUMN delivery_time_code text;
ALTER TABLE orders ADD COLUMN notes text;
ALTER TABLE orders ALTER COLUMN sell_group_id DROP NOT NULL;

-- 3. Per-item price on order_items
ALTER TABLE order_items ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;

-- 4. Customer address book
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL,
  care_of text,
  address jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

-- RLS for customer_addresses
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access to customer_addresses"
  ON customer_addresses FOR ALL
  USING (auth.role() = 'authenticated');
