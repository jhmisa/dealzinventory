-- Add 'internal' to message_role enum for staff-only internal notes
ALTER TYPE message_role ADD VALUE IF NOT EXISTS 'internal';
