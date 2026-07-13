-- AI Ops Harness (slice 1): proposals queue + activity audit + settings.
-- Spec: docs/superpowers/specs/2026-07-13-ai-ops-harness-design.md

CREATE TABLE ai_ops_proposals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('reply')),
  status       text NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED')),
  summary      text NOT NULL,
  rationale    text,
  confidence   numeric CHECK (confidence >= 0 AND confidence <= 1),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_ref   text,           -- conversation id at propose time; sent message id after execution
  error        text,
  created_by   text NOT NULL DEFAULT 'ops-agent',
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note  text,
  reviewed_at  timestamptz,
  executed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_ops_proposals_status ON ai_ops_proposals(status, created_at DESC);
-- One live reply proposal per conversation (re-propose replaces, enforced in code; this backstops it).
CREATE UNIQUE INDEX idx_ai_ops_one_pending_reply_per_conv
  ON ai_ops_proposals ((payload->>'conversation_id'))
  WHERE status = 'PENDING' AND type = 'reply';

ALTER TABLE ai_ops_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access ai_ops_proposals" ON ai_ops_proposals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access ai_ops_proposals" ON ai_ops_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON ai_ops_proposals TO authenticated, service_role;
REVOKE ALL ON ai_ops_proposals FROM anon;

CREATE TABLE ai_ops_activity (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool           text NOT NULL,
  args           jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  proposal_id    uuid REFERENCES ai_ops_proposals(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_ops_activity_created ON ai_ops_activity(created_at DESC);
ALTER TABLE ai_ops_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ai_ops_activity" ON ai_ops_activity
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access ai_ops_activity" ON ai_ops_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON ai_ops_activity TO authenticated;
GRANT ALL ON ai_ops_activity TO service_role;
REVOKE ALL ON ai_ops_activity FROM anon;

INSERT INTO system_settings (key, value) VALUES
  ('ai_ops_enabled', 'true'),
  ('ai_ops_autonomy_reply', 'PROPOSE')
ON CONFLICT (key) DO NOTHING;
