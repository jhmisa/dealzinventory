-- Make customer_id optional on tickets (allows ticket creation for unlinked conversations)
ALTER TABLE tickets ALTER COLUMN customer_id DROP NOT NULL;

-- Auto-link tickets when a customer is linked to a conversation
CREATE OR REPLACE FUNCTION link_tickets_on_customer_link()
RETURNS TRIGGER AS $$
BEGIN
  -- When customer_id is set on a conversation (was NULL, now has value)
  IF OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    UPDATE tickets
    SET customer_id = NEW.customer_id
    WHERE conversation_id = NEW.id
      AND customer_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_link_tickets_on_customer_link
  AFTER UPDATE OF customer_id ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION link_tickets_on_customer_link();
