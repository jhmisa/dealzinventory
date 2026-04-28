# Internal Staff Notes — Design Spec

## Context

Staff need to discuss customer conversations internally without the customer seeing those messages. Currently, staff use Missive's built-in team chat for this, but our Dealz messaging page has no equivalent. This creates a split workflow — staff must switch between Dealz and Missive to collaborate.

The goal is to add Missive-style internal notes directly into the conversation thread so staff can discuss a customer's situation in-line with the conversation timeline, giving full context at a glance.

## Design

### How It Works

Internal notes appear **interleaved chronologically** in the same message thread as customer and staff messages. They are visually distinguished by a different bubble color (amber/yellow tint) and a small "Internal" label. A separate input box at the bottom of the conversation pane ("Chat with your team...") is used to post notes.

**Only staff see internal notes.** They are never sent to the customer via Facebook/email/SMS.

### Visual Layout

```
┌─────────────────────────────────┐
│  Header (customer name, etc.)   │
├─────────────────────────────────┤
│                                 │
│  Chronological message thread:  │
│                                 │
│  ← [Customer msg - gray]        │
│       [Internal note - amber] → │  ← staff initials + "Internal" label
│       [Staff reply - blue]   → │
│  ← [Customer msg - gray]        │
│       [Internal note - amber] → │
│                                 │
├─────────────────────────────────┤
│  [Type a reply...]     [Send]   │  ← existing customer composer
│  [Attach] [Responses] [Inv]     │
├─── ── ── ── ── ── ── ── ── ────┤
│  [Chat with your team...] [→]   │  ← new internal note input
└─────────────────────────────────┘
```

### Internal Note Bubble Styling

- **Position**: right-aligned (same as staff messages)
- **Background**: `bg-amber-50` with `border border-amber-200` (warm tint to distinguish from blue staff messages)
- **Label**: small "Internal" text badge above or beside the message in amber
- **Avatar**: staff initials avatar (left of bubble, same as current staff messages)
- **Sender name**: staff `display_name` shown
- **Timestamp**: same format as other messages

### Data Model

**Extend `message_role` enum** — add `'internal'` value:

```sql
ALTER TYPE message_role ADD VALUE 'internal';
```

Internal notes use the existing `messages` table:

| Field | Value |
|-------|-------|
| `conversation_id` | The conversation being discussed |
| `role` | `'internal'` |
| `content` | Note text (plain text only) |
| `sent_by` | `auth.uid()` of the staff member |
| `status` | `'SENT'` (always — no draft/sending flow) |
| `message_type` | `'REPLY'` (default) |
| `ai_confidence` | `null` |

No new tables needed.

### RLS Policy

Add a policy so any authenticated staff can insert internal notes:

```sql
CREATE POLICY "Staff can insert internal notes"
ON messages FOR INSERT
TO authenticated
WITH CHECK (role = 'internal' AND sent_by = auth.uid());
```

The existing SELECT policy already allows staff to read all messages.

### Sending Internal Notes

**Do NOT use the `send-message` Edge Function** — that function sends messages to Missive/Facebook. Internal notes are inserted directly into the `messages` table via Supabase client.

New service function:

```typescript
async function sendInternalNote(conversationId: string, content: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'internal',
    content: content.trim(),
    sent_by: user.id,
    status: 'SENT',
  })
}
```

New mutation hook: `useSendInternalNote()` — invalidates message queries on success.

### Message Thread Rendering Changes

In `conversation-thread.tsx`, the message rendering loop currently uses:
```typescript
const isCustomer = msg.role === 'customer'
```

Update to handle three styles:
```typescript
const isCustomer = msg.role === 'customer'
const isInternal = msg.role === 'internal'
```

Styling logic:
- `isCustomer` → left-aligned, `bg-muted` (unchanged)
- `isInternal` → right-aligned, `bg-amber-50 border border-amber-200` + "Internal" label
- else (staff/assistant) → right-aligned, `bg-blue-100` (unchanged)

Internal notes show sender name (like staff messages already do).

### Internal Note Input Component

A simple input below the existing `MessageComposer`:

- Placeholder: "Chat with your team..."
- Submit on Enter (no Shift+Enter for multiline needed, but could support it)
- Small send button (arrow icon)
- Subtle visual separation from customer composer (thin divider line)
- Muted/subtle styling to differentiate from the primary composer

### Realtime

No changes needed. The existing `useMessagingRealtime()` hook watches all `messages` table changes and invalidates the message query. Internal notes will appear automatically for all staff viewing the conversation.

### Edge Cases

- **Empty notes**: trim whitespace, don't send if empty
- **Conversation not selected**: input disabled
- **No auth**: should not happen (admin page is behind auth), but guard with `sent_by = auth.uid()` in RLS

### What This Does NOT Include

- Editing or deleting internal notes (append-only)
- File attachments on internal notes
- @mentions or notifications
- Emoji reactions
- Internal notes in conversation list preview (only customer messages shown in preview)

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_internal_notes.sql` | Add `'internal'` to `message_role` enum + RLS policy |
| `src/components/messaging/internal-note-input.tsx` | **New** — simple text input component |
| `src/components/messaging/conversation-thread.tsx` | Add internal note styling in message loop + add InternalNoteInput below composer |
| `src/services/messaging.ts` | Add `sendInternalNote()` function |
| `src/hooks/use-messaging.ts` | Add `useSendInternalNote()` mutation hook |

## Verification

1. Open the messages page, select a conversation
2. See the "Chat with your team..." input below the customer reply composer
3. Type a note and press Enter — it appears in the thread with amber styling
4. Open the same conversation in another browser/tab — note appears in real-time
5. Verify the note does NOT appear in Missive or get sent to the customer
6. Verify customer messages and staff replies still render correctly
7. Verify the conversation list preview does not show internal notes
