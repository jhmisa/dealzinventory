-- Add is_live_selling flag to sell_groups
ALTER TABLE sell_groups ADD COLUMN is_live_selling boolean NOT NULL DEFAULT false;
CREATE INDEX idx_sell_groups_live_selling ON sell_groups (id) WHERE is_live_selling = true;
