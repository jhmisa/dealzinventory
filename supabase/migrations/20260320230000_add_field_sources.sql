-- Add field_sources JSONB to track where each spec field value came from.
-- Values: "template" (set by product template assignment) or "user" (manually edited by staff).
-- Empty/missing keys are treated as overwritable by template (safe default for existing data).
ALTER TABLE items ADD COLUMN IF NOT EXISTS field_sources jsonb DEFAULT '{}';

COMMENT ON COLUMN items.field_sources IS 'Tracks source of each spec field value: "template" or "user". Missing keys treated as template-overwritable.';
