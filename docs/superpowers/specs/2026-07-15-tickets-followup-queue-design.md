# Tickets as a unified follow-up & task queue — design

**Date:** 2026-07-15 · **Approved by:** Joey (chat) · **Status:** approved, implementing

## Problem

1. Create Ticket dialog forces staff to type Subject AND Description; live data shows
   they're duplicating one-liners (9 verbatim dupes; 38/50 stock requests have <40-char
   descriptions). Follow-up dates are encoded in prose ("Sa July 16", "July 20 - Lenovo
   Earphones") where nothing can sort or alert on them.
2. The Tickets list is a flat created-desc table: real customer problems (Technical,
   Return) sit level with routine stock promises; priority is almost never set by hand.
   Joey wants tickets to become the company-wide follow-up/reminder/task system where
   urgent items are impossible to miss.

## Design

### Data model (migration `20260715120000_tickets_followup_queue.sql`)

- `ticket_types.kind text NOT NULL DEFAULT 'problem' CHECK (kind IN ('problem','followup'))`
  — Return/Complaint/Technical/Delivery = problem; Stock Request/General = followup.
  All downstream behavior (form layout, queue bands, badge) derives from this flag.
- `tickets.follow_up_at date NULL` — the real, sortable follow-up date.
- `tickets.item_label text NULL` — what the ticket is about ("Poco X7").
- `tickets.item_code text NULL` — P/B/G code when staff picked a live inventory result.
- Partial index on `tickets(follow_up_at)` for open tickets.

### Create Ticket dialog (type-aware, subject never typed)

- **Follow-up types:** Item (free text; ≥2 chars triggers the same multi-source
  inventory search used by Messages → Search Inventory; picking a result stores
  `item_code` + label) · Follow-up date (chips: Today / Tomorrow / Next week / date
  picker / No date, computed in JST) · optional Note · priority.
  Subject auto-composes: `item_label — first line of note` (or just the item).
  Description stores the note (falls back to subject text — column is NOT NULL).
- **Problem types:** Description only; subject = first line of description (≤60 chars).
  Return flow (order + items + reason) unchanged; its auto-subject already worked
  this way. Order selector unchanged for both kinds.
- Subject input is removed from the dialog entirely.
- Single source of truth for composition + bucketing: `src/lib/ticket-followups.ts`.

### Tickets page — Queue view (default)

New default "Queue" tab ahead of the existing status tabs, containing only
OPEN/IN_PROGRESS tickets in bands:

1. 🔴 **Needs Attention** — all open problem-kind tickets + overdue follow-ups.
   Sort: priority (URGENT>HIGH>NORMAL>LOW), then oldest first.
2. 🟡 **Due Today** — follow-ups with `follow_up_at = today` (JST).
3. 📅 **Upcoming** — future dates, ascending.
4. ⬜ **No Date** — follow-ups without a date, with an "add a date" nudge.

Existing status tabs stay as history view; the classic table gains a **Follow-up**
column (overdue/today badges). Search/type/priority filters unchanged.

### Ticket detail

Editable follow-up date (+ shows item label/code). Rescheduling = snooze.

### Sidebar badge

Tickets nav item shows count of (open problems + overdue + due today), destructive
style, 60s refetch — same pattern as the Messages needs-review badge.

### Existing data

No text-parsing backfill. Open follow-ups land in ⬜ No Date; staff add dates as they
touch them. Problems flow into 🔴 automatically.

### Untouched

Ticket codes/statuses/RLS, customer self-service create-ticket edge fn (problem-kind
by nature), 2026-07-15 coherence triggers, Missive messaging.

## Verification

Build clean; Playwright E2E on local dev: create follow-up via dialog → lands in
Upcoming with composed subject + linked code; overdue ticket appears in Needs
Attention; badge count = Needs Attention + Due Today; test tickets deleted after.
