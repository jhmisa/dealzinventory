-- Backfill: correct tickets whose customer_id has drifted away from their
-- conversation's current customer_id.
--
-- Background: tickets snapshot conversations.customer_id at creation time. The
-- bidirectional cascade trigger added in 20260506100001 keeps them in sync going
-- forward, but tickets that drifted BEFORE that trigger was deployed (e.g. a
-- conversation unlinked/relinked while the old forward-only trigger was active)
-- were never corrected. This one-time backfill enforces the same invariant the
-- trigger enforces: a conversation-linked ticket's customer_id always equals its
-- conversation's current customer_id (NULL included).
--
-- Tickets with no conversation_id (customer self-service tickets) are untouched.
-- See docs/investigations/incorrect-ticket-linking.md.

-- Report drift before the fix (expected: the 5 tickets in the investigation doc).
DO $$
DECLARE
  v_before int;
BEGIN
  SELECT count(*) INTO v_before
  FROM tickets t
  JOIN conversations c ON c.id = t.conversation_id
  WHERE t.customer_id IS DISTINCT FROM c.customer_id;
  RAISE NOTICE 'Drifted conversation-linked tickets before backfill: %', v_before;
END $$;

UPDATE tickets t
SET customer_id = c.customer_id
FROM conversations c
WHERE t.conversation_id = c.id
  AND t.customer_id IS DISTINCT FROM c.customer_id;

-- Report drift after the fix (expected: 0).
DO $$
DECLARE
  v_after int;
BEGIN
  SELECT count(*) INTO v_after
  FROM tickets t
  JOIN conversations c ON c.id = t.conversation_id
  WHERE t.customer_id IS DISTINCT FROM c.customer_id;
  RAISE NOTICE 'Drifted conversation-linked tickets after backfill: %', v_after;
END $$;
