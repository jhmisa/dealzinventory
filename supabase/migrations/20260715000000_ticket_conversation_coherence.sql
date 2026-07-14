-- Ticket ↔ conversation coherence: enforce the invariant at the tickets side.
--
-- Background (docs/investigations/incorrect-ticket-linking.md, 2026-07-15 update):
-- the reverse-cascade trigger from 20260506100001 keeps tickets in sync when a
-- CONVERSATION's customer changes, but tickets could still be BORN incoherent —
-- the Create Ticket dialog stayed mounted across conversation switches and
-- submitted a stale conversation_id (or stale customer_id) captured at mount.
-- Result: tickets attached to conversation X but pinned to customer Y.
--
-- This migration:
--   1. Adds a BEFORE INSERT OR UPDATE OF conversation_id trigger on tickets that
--      snaps customer_id to the conversation's current customer whenever a
--      conversation is attached. A conversation-linked ticket can no longer be
--      created (or re-pointed) with a mismatched customer.
--   2. Remediates the 8 tickets that drifted this way (evidence per ticket in the
--      investigation doc): 7 had the RIGHT customer but a stale conversation —
--      repoint conversation_id to that customer's own (single) conversation.
--      TK000093 had the RIGHT (unlinked) conversation but a stale customer —
--      clear customer_id; the forward-link trigger fills it when staff link the
--      conversation.
--
-- Messaging flow is untouched: no changes to conversations/messages triggers.

-- 1. Insert/repoint-time coherence trigger on tickets
CREATE OR REPLACE FUNCTION sync_ticket_customer_with_conversation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT c.customer_id INTO NEW.customer_id
    FROM conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_ticket_customer_with_conversation ON tickets;
CREATE TRIGGER trg_sync_ticket_customer_with_conversation
  BEFORE INSERT OR UPDATE OF conversation_id ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_ticket_customer_with_conversation();

-- 2a. Repoint stale conversation_id for tickets whose customer_id is correct.
--     Each of these customers has exactly one conversation; the count guard keeps
--     this idempotent and safe if that ever changes before the migration runs.
UPDATE tickets t
SET conversation_id = c.id
FROM conversations c
WHERE c.customer_id = t.customer_id
  AND t.ticket_code IN ('TK000089','TK000097','TK000099','TK000125','TK000126','TK000135','TK000142')
  AND t.customer_id IS NOT NULL
  AND (SELECT count(*) FROM conversations c2 WHERE c2.customer_id = t.customer_id) = 1;

-- 2b. TK000093: the attached conversation (unlinked) is the correct one; the
--     customer snapshot is stale. Clear it so the panel shows the contact name
--     and the forward-link trigger can fill it on a future link.
UPDATE tickets
SET customer_id = NULL
WHERE ticket_code = 'TK000093'
  AND conversation_id IS NOT NULL;

-- 3. Report remaining drift (expected: 0)
DO $$
DECLARE
  v_after int;
BEGIN
  SELECT count(*) INTO v_after
  FROM tickets t
  JOIN conversations c ON c.id = t.conversation_id
  WHERE t.customer_id IS DISTINCT FROM c.customer_id;
  RAISE NOTICE 'Drifted conversation-linked tickets after coherence fix: %', v_after;
END $$;
