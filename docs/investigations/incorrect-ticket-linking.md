# Investigation: Tickets pinned to a customer their conversation no longer points to

> **Status:** ✅ Resolved — 2026-06-03.
> **Reported:** 2026-05-06
> **Triggering case:** Customer C000560 (Joanna Marie Bernabe) had three tickets that all showed as linked to her in the admin tickets list, but two of them lived inside conversations whose Missive contact was a different person ("Ra Chel", "Cathy-Lyn Gutierrez Santos").

## Resolution (2026-06-03)

The root cause stood, but the earlier "fix" never actually closed the loop:

1. **Prevention was already deployed** — migration `20260506100001_tickets_reverse_cascade_and_audit.sql` (bidirectional cascade trigger + audit table) was applied to the remote DB on 2026-05-06, but the file was **never committed to git**. It is now committed. The trigger keeps `tickets.customer_id` in sync with `conversations.customer_id` on every unlink/relink going forward.
2. **The existing drift was never remediated.** The trigger only corrects *future* customer-link changes; the tickets that drifted *before* it was deployed were never fixed. New migration `20260603100000_backfill_ticket_customer_from_conversation.sql` enforces the invariant once over history. Live run reported **7 drifted tickets → 0** (more had accumulated than the 5 in the original snapshot below).
3. **Display consistency** — the admin tickets list (`src/pages/admin/tickets.tsx`) now falls back to the conversation's `contact_name` when a conversation-linked ticket has no customer, so TK000013 reads "Ra Chel" and TK000017 reads "Cathy-Lyn Gutierrez Santos" instead of a misleading C000560 or a bare "—". List, messaging panel, and ticket-detail page now agree.

End state for the reported tickets: TK000013 → no customer (shows "Ra Chel"), TK000017 → no customer (shows "Cathy-Lyn Gutierrez Santos"), TK000023 → C000560 (unchanged).

## Context

Customer **C000560 — Joanna Marie Bernabe** has three tickets that all show as linked to her in the admin tickets list:

- **TK000013** "Received Order of Another Customer" (Delivery Issue)
- **TK000017** "Wrong order delivered" (Complaint)
- **TK000023** "Wrong order delivered" (Return)

But when each ticket is opened in the **messages page customer panel**, the right-hand "Customer" header shows a different individual for two of them:

| Ticket | Sidebar shows | Has C-code? |
|---|---|---|
| TK000013 | "Ra Chel" | No — "Link Customer" button |
| TK000017 | "Cathy-Lyn Gutierrez Santos" | No — "Link Customer" button |
| TK000023 | JOANNA MARIE BERNABE | Yes — C000560 |

---

## What's actually in the database

Live SELECT against the three tickets:

| ticket_code | `tickets.customer_id` | `tickets.conversation_id` | `conversations.contact_name` | `conversations.customer_id` |
|---|---|---|---|---|
| TK000013 | C000560 | 64e5596e… | "Ra Chel" | **NULL** |
| TK000017 | C000560 | 45b9fe47… | "Cathy-Lyn Gutierrez Santos" | **NULL** |
| TK000023 | C000560 | 3ec514ca… | "Joanna Marie Bedro Bernabe" | C000560 |

So both views are reading the data correctly:
- The **tickets list** uses `tickets.customers` (joined via `tickets.customer_id`) → all three resolve to C000560.
- The **messaging customer panel** uses `conversations.customers` (joined via `conversations.customer_id`) → only TK000023's conversation resolves to C000560; the other two are unlinked, so the panel shows the raw `conversations.contact_name` and a "Link Customer" button.

**The discrepancy is real data drift, not a query bug.** Two of these tickets carry a `customer_id` that has no relationship to their current conversation.

---

## Root cause

**Tickets created from the messaging panel snapshot the conversation's customer at the moment of creation, and there is no path that reverts a ticket's `customer_id` if the conversation is later unlinked or relinked.**

Concretely, three ingredients combine:

### 1. The "+" button in the messaging customer panel writes whichever customer happens to be linked to the conversation right now.

`src/components/messaging/customer-panel.tsx:317-322`:

```tsx
<CreateTicketDialog
  open={ticketDialogOpen}
  onOpenChange={setTicketDialogOpen}
  customerId={customer?.id}        // current linked customer at click time
  conversationId={conversation.id} // current conversation
/>
```

`customer?.id` resolves from `conversation.customers?.id` (line 78), so it reflects whatever `conversations.customer_id` is **at the moment the dialog opens**.

`src/components/tickets/create-ticket-dialog.tsx:68, 187-198` then writes `customer_id: data.customer_id` into the insert. The dialog has **no UI to choose a customer** — it always uses the prop.

`src/services/tickets.ts:282`:
```ts
customer_id: input.customer_id || null,
```

So a ticket created while the conversation is linked to X is born with `customer_id = X`. Hard-baked.

### 2. The auto-link trigger only goes one way.

`supabase/migrations/20260430100002_tickets_optional_customer.sql`:

```sql
IF OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL THEN
  UPDATE tickets
  SET customer_id = NEW.customer_id
  WHERE conversation_id = NEW.id
    AND customer_id IS NULL;
END IF;
```

It scopes correctly to the conversation (no cross-conversation contamination), but it only fires when a conversation goes from *unlinked → linked*, and only updates *orphan* tickets. **Unlink (NOT NULL → NULL) is a no-op for tickets.** Relink (X → Y) is also a no-op (`OLD.customer_id IS NULL` is false).

Trigger inventory on both tables — no reverse trigger exists:

```
conversations: set_conversations_updated_at, trg_link_tickets_on_customer_link, trg_unarchive_to_inbox
tickets:       set_tickets_updated_at
```

### 3. The unlink action only touches the conversation.

`src/services/messaging.ts:131-143`:

```ts
export async function unlinkCustomerFromConversation(conversationId: string) {
  await supabase
    .from('conversations')
    .update({ customer_id: null, unmatched_contact: true })
    .eq('id', conversationId)
  ...
}
```

No cascade to `tickets`. So once a ticket is born with a `customer_id`, the only paths that modify it are: explicit `updateTicket` calls (which never set `customer_id`), or the forward auto-link trigger (which won't touch a non-NULL `customer_id`).

### What most likely happened to TK000013 and TK000017

Two scenarios both produce the observed state. Both depend on an **unlink/relink action** between ticket creation and now:

**Scenario A — link, create, unlink (most likely):**
1. Staff opened Ra Chel's / Cathy-Lyn's conversation, used the customer-linker to attach C000560 (perhaps thinking it was Joanna's other Facebook handle, perhaps to investigate the "wrong order delivered" complaint by viewing Joanna's order list).
2. While linked, staff clicked "+" in the Tickets section. The dialog received `customerId = C000560`. Ticket inserted with `customer_id = C000560`, `conversation_id = Ra Chel's / Cathy-Lyn's`.
3. Staff later realized the contact wasn't really Joanna and clicked Unlink. `conversations.customer_id` reset to NULL. **`tickets.customer_id` stayed at C000560.**

**Scenario B — create-while-linked, then conversation got relinked elsewhere:**
The conversation was momentarily linked to C000560, the ticket was created, then the conversation was unlinked (or relinked to someone else). Same end state.

The data is consistent with either path: `conversations.updated_at` for both Ra Chel's and Cathy-Lyn's rows is **after** the ticket's `created_at`, which is compatible with a later unlink edit on the conversation:

- TK000013 created `2026-05-01 05:28:42` · Ra Chel's conv last updated `2026-05-02 10:05:41`
- TK000017 created `2026-05-02 03:58:20` · Cathy-Lyn's conv last updated `2026-05-02 05:38:18`

`updated_at` alone can't tell us whether the last edit was an unlink or just a new incoming Missive message — there is no audit log for `conversations.customer_id` changes.

---

## Scope — this is not isolated to C000560

Running the same predicate across all tickets — *"ticket has a `customer_id`, and the conversation no longer points to that customer"* — returns **5 affected tickets**, not 3:

| Ticket | Ticket's customer | Conversation contact | Conversation now linked to |
|---|---|---|---|
| TK000013 | C000560 (Joanna) | "Ra Chel" | (unlinked) |
| TK000017 | C000560 (Joanna) | "Cathy-Lyn Gutierrez Santos" | (unlinked) |
| TK000020 | C000580 (Mary Rose Alcala) | "C000380 / Roneia Cabanting" | **C000380 (Roneia)** |
| TK000022 | C000080 (Maricel Yanagibashi) | "Marian Garcia Nakanishi" | (unlinked) |
| TK000024 | C000576 | "Re Becca Diane" | **C000566** |

Three of them (TK000020, TK000022, TK000024) involve other customers — so this is a system-wide pattern of *"ticket pinned to a customer whose conversation it's no longer attached to."* Some are unlink cases (TK000013, TK000017, TK000022); some are conversation-relinked-to-someone-else cases (TK000020, TK000024).

C000560 just happens to be the most visible because three of the five affected tickets sit on her record.

---

## Why the staff sidebar still shows the contact name (not the linked customer)

For TK000013 and TK000017 the sidebar in the screenshots is the **messaging customer panel** (`src/components/messaging/customer-panel.tsx`). That panel shows `conversation.customers` — i.e., the conversation's current customer, not the ticket's. Since the conversations are unlinked, it falls back to `conversation.contact_name` and the "Link Customer" button appears. So the sidebar isn't lying; it's faithfully showing the conversation's state.

For TK000023 the conversation is still linked to C000560, so the same panel correctly shows JOANNA MARIE BERNABE with C-code.

A separate-but-related view, the **ticket detail page sidebar** (`src/pages/admin/ticket-detail.tsx:182-196`), would show *Joanna* even for TK000013 — because that view reads `ticket.customers`, not `conversation.customers`. The two pages are inconsistent in which "customer" they trust as the source of truth.

---

## Critical files (for reference, not for editing)

- `src/components/messaging/customer-panel.tsx:78, 317-322` — passes current conv-customer into the create dialog
- `src/components/tickets/create-ticket-dialog.tsx:68, 187-198` — no customer selector, just uses the prop
- `src/services/tickets.ts:282` — `customer_id: input.customer_id || null`
- `src/services/messaging.ts:131-143` — unlink only touches `conversations`, no cascade
- `supabase/migrations/20260430100002_tickets_optional_customer.sql` — forward-only auto-link trigger
- `src/components/tickets/ticket-list-table.tsx:68-74` — list shows `ticket.customers` (the wrong-but-stored value)
- `src/pages/admin/ticket-detail.tsx:182-196` — detail page also shows `ticket.customers`, falls back to `conversation.contact_name` only when `customer_id` is NULL

---

## Verification queries (re-runnable)

```sql
-- The three reported tickets
SELECT t.ticket_code, t.customer_id, t.conversation_id,
       conv.contact_name, conv.customer_id AS conv_customer_id
FROM tickets t
LEFT JOIN conversations conv ON conv.id = t.conversation_id
WHERE t.ticket_code IN ('TK000013','TK000017','TK000023');

-- All similarly drifted tickets across the system
SELECT t.ticket_code, tc.customer_code AS ticket_customer,
       conv.contact_name, cc.customer_code AS conv_current_customer
FROM tickets t
JOIN customers tc          ON tc.id = t.customer_id
LEFT JOIN conversations conv ON conv.id = t.conversation_id
LEFT JOIN customers cc       ON cc.id = conv.customer_id
WHERE t.conversation_id IS NOT NULL
  AND (conv.customer_id IS NULL OR conv.customer_id <> t.customer_id);

-- Confirm no reverse trigger exists
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_table IN ('tickets','conversations');
```

---

## Solution options to consider when we revisit

No code changes have been made; capturing options here for the next session.

### A. Data remediation only (no code change)
Manually review each of the 5 drifted tickets and decide per-ticket whether `customer_id` is correct, should be cleared (`NULL`), or should be moved to the conversation's current customer. Quick to do; doesn't prevent recurrence.

### B. Add an audit log first
Add a small audit table for `conversations.customer_id` changes (who, when, old → new) so future drift is explainable. `updated_at` alone can't tell us whether the last edit was an unlink, a relink, or just a Missive message arriving. Useful in isolation; pairs well with C.

### C. Prevent recurrence in code — sub-options ranked narrow → broad

- **C1. Cascade unlink to tickets (reverse trigger).** When `conversations.customer_id` goes NOT NULL → NULL (or X → Y), set `tickets.customer_id = NEW.customer_id` for tickets where `conversation_id = NEW.id`. Risk: if a ticket's `customer_id` was deliberately set to a different customer than the conversation's, this overwrites it. Probably fine given today's UI (no path sets a different customer), but worth confirming.
- **C2. Confirmation dialog on Unlink.** Before unlinking, fetch attached tickets and ask the user whether to (a) clear those tickets' `customer_id`, (b) reassign them to a different customer, or (c) leave them. Highest signal-to-noise but most UI work.
- **C3. Block ticket creation from an unlinked conversation.** Force the user to link a customer first, so `customer_id` always matches `conversation.customer_id` at creation time. Doesn't fix existing drift, but eliminates one of the two ways to get into this state.
- **C4. Make `tickets.customer_id` derived.** Drop the column, always resolve via `conversation.customer_id`. Big refactor; breaks the use case of tickets that don't belong to any conversation (e.g., customer-initiated support tickets via `src/pages/customer/create-ticket.tsx`). Probably overkill.

### Recommended starting point when we resume

C1 + B together: add the reverse trigger to stop the bleed, and add the audit table so we can investigate any future case directly. Then triage the existing 5 tickets manually (option A). C2/C3 can come later if the simple cascade turns out to be too aggressive.
