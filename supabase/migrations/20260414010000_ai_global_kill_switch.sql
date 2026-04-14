-- Global AI kill switch: allows disabling all AI draft generation with one setting
INSERT INTO system_settings (key, value, description)
VALUES ('ai_messaging_enabled', 'false', 'Global toggle for AI auto-draft generation. Set to false to disable all AI drafts.')
ON CONFLICT (key) DO NOTHING;
