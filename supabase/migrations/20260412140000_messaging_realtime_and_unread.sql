-- Enable Realtime on messaging tables
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Add unread tracking to conversations
ALTER TABLE conversations
  ADD COLUMN unread_count integer NOT NULL DEFAULT 0;

-- Function to increment unread count when a customer message arrives
CREATE OR REPLACE FUNCTION increment_unread_on_customer_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role = 'customer' AND NEW.status = 'SENT' THEN
    UPDATE conversations
    SET unread_count = unread_count + 1
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_unread
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION increment_unread_on_customer_message();
