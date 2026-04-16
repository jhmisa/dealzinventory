-- Add is_archived flag to conversations
ALTER TABLE conversations
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Partial index for archived conversations
CREATE INDEX idx_conversations_archived ON conversations(is_archived) WHERE is_archived = true;

-- Trigger: when a conversation is unarchived, move it to Inbox
CREATE OR REPLACE FUNCTION unarchive_to_inbox()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_archived = true AND NEW.is_archived = false THEN
    NEW.folder_id := (SELECT id FROM message_folders WHERE name = 'Inbox' LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_unarchive_to_inbox
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION unarchive_to_inbox();

-- Replace get_awaiting_reply_counts to exclude archived conversations
CREATE OR REPLACE FUNCTION get_awaiting_reply_counts()
RETURNS TABLE(folder_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.folder_id,
    COUNT(*)::bigint AS count
  FROM conversations c
  WHERE c.folder_id IS NOT NULL
    AND NOT c.is_archived
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'customer'
        AND m.status = 'SENT'
        AND NOT EXISTS (
          SELECT 1 FROM messages m2
          WHERE m2.conversation_id = c.id
            AND m2.role IN ('staff', 'assistant')
            AND m2.status = 'SENT'
            AND m2.created_at > m.created_at
        )
    )
  GROUP BY c.folder_id;
$$;
