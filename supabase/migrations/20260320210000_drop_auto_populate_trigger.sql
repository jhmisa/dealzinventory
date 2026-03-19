-- Drop the auto-populate trigger entirely.
-- Auto-population will be handled by the frontend instead, which gives
-- us full control over type safety and null/empty-string handling.
DROP TRIGGER IF EXISTS trg_auto_populate_from_product ON items;
DROP FUNCTION IF EXISTS auto_populate_item_from_product();
