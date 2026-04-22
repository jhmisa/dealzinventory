-- Add missing item tracking fields
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS missing_since timestamptz,
  ADD COLUMN IF NOT EXISTS missing_notes text;
