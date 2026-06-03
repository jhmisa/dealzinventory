-- Reverse-cascade ticket customer_id when a conversation's customer_id changes,
-- and audit conversation customer_id changes for future investigations.
--
-- Background: tickets snapshot conversations.customer_id at creation. The previous
-- trigger only handled NULL → NOT NULL (forward link). Unlinks (X → NULL),
-- manual relinks (X → Y), and webhook auto-relinks of unlinked conversations could
-- silently drift tickets.customer_id away from their conversation's customer.
-- See docs/investigations/incorrect-ticket-linking.md.

-- 1. Audit table for conversations.customer_id changes
CREATE TABLE IF NOT EXISTS conversation_customer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  old_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  new_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_customer_audit_conv_id
  ON conversation_customer_audit(conversation_id, created_at DESC);

ALTER TABLE conversation_customer_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read conversation customer audit"
  ON conversation_customer_audit FOR SELECT
  USING (true);

CREATE POLICY "System can insert conversation customer audit"
  ON conversation_customer_audit FOR INSERT
  WITH CHECK (true);

-- 2. Replace the forward-only function with a bidirectional cascade.
--    Updates only tickets currently matching OLD.customer_id (or NULL), so any
--    intentional divergence introduced by future code is preserved.
CREATE OR REPLACE FUNCTION link_tickets_on_customer_link()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    UPDATE tickets
    SET customer_id = NEW.customer_id
    WHERE conversation_id = NEW.id
      AND (customer_id = OLD.customer_id OR customer_id IS NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Audit trigger: log every customer_id change with auth context.
--    auth.uid() returns NULL for service-role calls (e.g., the Missive webhook),
--    which is itself useful signal — NULL changed_by = automated.
CREATE OR REPLACE FUNCTION log_conversation_customer_change()
RETURNS TRIGGER AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    BEGIN
      v_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      v_uid := NULL;
    END;

    IF v_uid IS NOT NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    END IF;

    INSERT INTO conversation_customer_audit (
      conversation_id, old_customer_id, new_customer_id, changed_by, changed_by_email
    ) VALUES (
      NEW.id, OLD.customer_id, NEW.customer_id, v_uid, v_email
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_conversation_customer_change ON conversations;
CREATE TRIGGER trg_audit_conversation_customer_change
  AFTER UPDATE OF customer_id ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION log_conversation_customer_change();
