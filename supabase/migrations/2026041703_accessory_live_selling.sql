-- Add is_live_selling flag to accessories table
ALTER TABLE accessories ADD COLUMN is_live_selling BOOLEAN NOT NULL DEFAULT false;

-- Partial index for fast lookups of live-selling accessories
CREATE INDEX idx_accessories_live_selling ON accessories (id) WHERE is_live_selling = true;
