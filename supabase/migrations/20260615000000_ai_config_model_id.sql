-- Add a configurable model id to ai_configurations
-- (used by invoice parsing + image enhancement; messaging uses ai_providers).
-- Nullable: when null, edge functions fall back to per-provider defaults.
ALTER TABLE ai_configurations
  ADD COLUMN IF NOT EXISTS model_id text;
