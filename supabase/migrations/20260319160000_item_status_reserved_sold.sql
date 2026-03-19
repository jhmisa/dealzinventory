-- Add RESERVED and SOLD values to item_status enum
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'SOLD';
