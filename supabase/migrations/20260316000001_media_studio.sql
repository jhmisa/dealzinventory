-- ============================================================
-- Media Studio: AI Prompts table + ai_configurations.purpose
-- ============================================================

-- Add purpose column to ai_configurations
ALTER TABLE ai_configurations
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'invoice_parsing';

-- Create AI Prompts table
CREATE TABLE ai_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  prompt_text     text NOT NULL,
  media_type      text NOT NULL DEFAULT 'image',
  sample_image_url text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ai_prompts_updated
  BEFORE UPDATE ON ai_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_ai_prompts_active ON ai_prompts (is_active) WHERE is_active = true;
CREATE INDEX idx_ai_prompts_media_type ON ai_prompts (media_type);

-- RLS for ai_prompts
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read ai_prompts"
  ON ai_prompts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert ai_prompts"
  ON ai_prompts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Staff can update ai_prompts"
  ON ai_prompts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Staff can delete ai_prompts"
  ON ai_prompts FOR DELETE
  TO authenticated
  USING (true);
