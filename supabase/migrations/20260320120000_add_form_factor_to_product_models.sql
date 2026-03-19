-- Add form_factor column to product_models if it doesn't exist
-- (Was in original schema but missing from remote database; referenced by a DB trigger)
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS form_factor text;
