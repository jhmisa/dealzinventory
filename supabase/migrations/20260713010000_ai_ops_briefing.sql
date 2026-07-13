-- AI Ops slice 1.5: 'briefing' proposal type (informational attention reports) +
-- 'ACKNOWLEDGED' status (staff dismisses a briefing without executing anything).
-- Briefings are never executable — ai-ops-execute only handles type='reply'.

ALTER TABLE ai_ops_proposals DROP CONSTRAINT ai_ops_proposals_type_check;
ALTER TABLE ai_ops_proposals ADD CONSTRAINT ai_ops_proposals_type_check
  CHECK (type IN ('reply', 'briefing'));

ALTER TABLE ai_ops_proposals DROP CONSTRAINT ai_ops_proposals_status_check;
ALTER TABLE ai_ops_proposals ADD CONSTRAINT ai_ops_proposals_status_check
  CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED','ACKNOWLEDGED'));
