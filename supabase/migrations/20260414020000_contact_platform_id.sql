-- Store the customer's platform-specific ID (e.g. Facebook PSID) on the conversation
-- so we can use it directly when sending replies without re-fetching from Missive
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_platform_id text;
