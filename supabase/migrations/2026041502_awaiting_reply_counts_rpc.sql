-- RPC to get count of conversations awaiting staff reply per folder
-- A conversation is "awaiting reply" if its most recent message is from the customer
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
