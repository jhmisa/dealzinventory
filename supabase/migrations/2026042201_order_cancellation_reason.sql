-- Add cancellation reason fields to orders table
ALTER TABLE orders
  ADD COLUMN cancellation_category text,
  ADD COLUMN cancellation_notes text;
