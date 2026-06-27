-- Keep updated_at fresh on edits (matches sibling messaging_specialists table).
DROP TRIGGER IF EXISTS set_messaging_sub_intents_updated_at ON messaging_sub_intents;
CREATE TRIGGER set_messaging_sub_intents_updated_at
  BEFORE UPDATE ON messaging_sub_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
