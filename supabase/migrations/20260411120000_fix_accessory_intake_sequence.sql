-- Fix: create missing rcv_code_seq sequence
-- The create_accessory_intake_batch function references this sequence
-- but it was never created in the original migration.
CREATE SEQUENCE IF NOT EXISTS rcv_code_seq START 1;
