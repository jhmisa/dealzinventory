-- Per-draft AI token + cost telemetry for messaging.
-- Lets us measure real monthly spend (pay-per-use vs flat subscription decision).
CREATE TABLE ai_usage_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid REFERENCES conversations(id) ON DELETE SET NULL,
  purpose            text NOT NULL DEFAULT 'messaging',
  provider           text NOT NULL,
  model_id           text NOT NULL,
  input_tokens       integer NOT NULL DEFAULT 0,
  output_tokens      integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  had_images         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_log_created_at ON ai_usage_log(created_at);
CREATE INDEX idx_ai_usage_log_conversation ON ai_usage_log(conversation_id);

-- RLS: staff (authenticated) may read; service_role (edge function) bypasses RLS for inserts.
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read ai_usage_log"
  ON ai_usage_log FOR SELECT
  TO authenticated
  USING (true);
