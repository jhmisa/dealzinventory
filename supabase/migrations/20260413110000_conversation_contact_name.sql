-- Add contact_name to conversations for unmatched contacts (e.g. Facebook sender name)
ALTER TABLE conversations ADD COLUMN contact_name text;
