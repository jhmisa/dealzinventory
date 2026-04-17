-- Add live selling flag to items table
ALTER TABLE items ADD COLUMN is_live_selling boolean NOT NULL DEFAULT false;

-- Partial index for efficient querying of live selling items
CREATE INDEX idx_items_live_selling ON items (is_live_selling) WHERE is_live_selling = true;

-- Auto-clear flag when item status changes away from AVAILABLE
CREATE OR REPLACE FUNCTION clear_live_selling_on_status_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.item_status <> 'AVAILABLE' AND OLD.is_live_selling = true THEN
    NEW.is_live_selling := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clear_live_selling
  BEFORE UPDATE ON items
  FOR EACH ROW
  WHEN (OLD.item_status IS DISTINCT FROM NEW.item_status)
  EXECUTE FUNCTION clear_live_selling_on_status_change();
