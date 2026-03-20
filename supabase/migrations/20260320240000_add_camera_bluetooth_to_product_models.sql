-- Add camera and bluetooth fields to product_models
ALTER TABLE product_models
  ADD COLUMN IF NOT EXISTS camera text,
  ADD COLUMN IF NOT EXISTS has_bluetooth boolean NOT NULL DEFAULT false;
