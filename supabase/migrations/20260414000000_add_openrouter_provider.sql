ALTER TABLE ai_providers DROP CONSTRAINT ai_providers_provider_check;
ALTER TABLE ai_providers ADD CONSTRAINT ai_providers_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'google', 'openrouter'));
