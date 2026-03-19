-- Add form_factor column to items table
-- A DB trigger copies form_factor from product_models to items on product assignment
ALTER TABLE items ADD COLUMN IF NOT EXISTS form_factor text;
