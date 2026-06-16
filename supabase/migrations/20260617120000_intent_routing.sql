-- Plan 3: intent routing.
-- 1) New folder for the kaitori (buy-back) pipeline. sort_order 7 places it after Technical (6).
--    Idempotent guard so re-running against a DB that already has it is a no-op.
INSERT INTO message_folders (name, icon, sort_order, is_system)
SELECT 'Kaitori', 'banknote', 7, false
WHERE NOT EXISTS (SELECT 1 FROM message_folders WHERE name = 'Kaitori');

-- 2) Persist the AI's classified intent on the conversation so it is queryable / observable
--    (today it lives only inside messages.ai_context_summary JSON).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_intent text;
