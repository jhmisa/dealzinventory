-- Tickets as a unified follow-up & task queue (spec:
-- docs/superpowers/specs/2026-07-15-tickets-followup-queue-design.md)
--
-- 1. ticket_types.kind — 'problem' (customer issues: return, complaint, technical,
--    delivery) vs 'followup' (reminders/tasks: stock-request, general). Drives the
--    create-dialog layout, queue bands, and sidebar badge.
-- 2. tickets.follow_up_at — real sortable follow-up date (was encoded in prose).
--    tickets.item_label / item_code — what the follow-up is about; item_code holds a
--    P/B/G code when staff picked a live inventory search result.

ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'problem'
    CHECK (kind IN ('problem','followup'));

UPDATE ticket_types SET kind = 'followup' WHERE slug IN ('stock-request','general');

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS follow_up_at date,
  ADD COLUMN IF NOT EXISTS item_label text,
  ADD COLUMN IF NOT EXISTS item_code text;

-- Queue reads: open tickets ordered/bucketed by follow-up date
CREATE INDEX IF NOT EXISTS idx_tickets_followup_open
  ON tickets (follow_up_at)
  WHERE ticket_status IN ('OPEN','IN_PROGRESS');
