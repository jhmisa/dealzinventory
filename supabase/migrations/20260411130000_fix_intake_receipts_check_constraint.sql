-- Fix: drop total_items_check constraint on intake_receipts
-- The create_accessory_intake_batch RPC inserts with total_items=0 initially,
-- then updates with the real total after processing all line items.
-- The CHECK (total_items > 0) constraint rejects the initial INSERT.

ALTER TABLE intake_receipts DROP CONSTRAINT IF EXISTS intake_receipts_total_items_check;
