-- Categories table for organizing products and items by type (e.g. Laptop, Phone, Tablet)
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  form_fields text[] NOT NULL DEFAULT '{}',
  description_fields text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS (idempotent — drop if exists then recreate)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read categories" ON categories;
DROP POLICY IF EXISTS "Staff can insert categories" ON categories;
DROP POLICY IF EXISTS "Staff can update categories" ON categories;
DROP POLICY IF EXISTS "Staff can delete categories" ON categories;
CREATE POLICY "Staff can read categories" ON categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert categories" ON categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can update categories" ON categories FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can delete categories" ON categories FOR DELETE USING (auth.uid() IS NOT NULL);

-- Add category_id FK to product_models and items
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_models_category ON product_models(category_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
