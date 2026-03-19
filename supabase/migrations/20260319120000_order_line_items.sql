-- Order line items redesign
-- Depends on: 20260319100000_manual_order_support.sql

-- 1. Add new columns to order_items
ALTER TABLE order_items ADD COLUMN description text;
ALTER TABLE order_items ADD COLUMN quantity integer NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN discount integer NOT NULL DEFAULT 0;

-- 2. Make item_id nullable for ad-hoc/custom line items
ALTER TABLE order_items ALTER COLUMN item_id DROP NOT NULL;

-- 3. Replace UNIQUE constraint with partial unique index
-- (allows multiple NULLs for ad-hoc items while keeping inventory items unique)
ALTER TABLE order_items DROP CONSTRAINT order_items_item_id_key;
CREATE UNIQUE INDEX idx_order_items_item_unique ON order_items (item_id) WHERE item_id IS NOT NULL;

-- 4. Add shipping_cost to orders
ALTER TABLE orders ADD COLUMN shipping_cost integer NOT NULL DEFAULT 0;

-- 5. Check constraints
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_quantity CHECK (quantity > 0);
ALTER TABLE order_items ADD CONSTRAINT chk_order_items_discount CHECK (discount >= 0);
ALTER TABLE orders ADD CONSTRAINT chk_orders_shipping_cost CHECK (shipping_cost >= 0);
