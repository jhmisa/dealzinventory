# Messaging Enhancements: Attachments, Canned Responses & Inventory Search

## Context

Agents currently can only send plain text messages through the messaging system. Customers often need visual context (payment instructions, product photos) and agents repeatedly type the same replies. These three features solve this:

1. **Attachment support** — send files/images via Messenger
2. **Canned responses** — pre-built messages with attachments, Missive-style panel
3. **Inventory search & insert** — search available inventory and insert product details + photos into messages

All three share a common attachment pipeline (upload → store → send via Missive).

---

## Part 1: Attachment Support (Foundation)

### Database

**Migration: add `attachments` columns**

```sql
-- Add attachments to messages table
ALTER TABLE messages ADD COLUMN attachments JSONB DEFAULT '[]';

-- Add attachments to messaging_templates table
ALTER TABLE messaging_templates ADD COLUMN attachments JSONB DEFAULT '[]';
```

Attachment JSONB schema:
```typescript
interface MessageAttachment {
  file_url: string      // Supabase Storage path
  filename: string      // Original filename
  mime_type: string     // e.g. 'image/png', 'application/pdf'
  size_bytes?: number   // Optional file size
}
```

### Supabase Storage

- New bucket: `messaging-attachments` (private, staff-only via RLS)
- Path pattern: `{conversation_id}/{uuid}_{filename}`
- Template attachments path: `templates/{template_id}/{uuid}_{filename}`

### Edge Function: `send-message` changes

**New input type:**
```typescript
interface SendMessageInput {
  conversation_id: string
  content: string
  approve_draft_id?: string
  attachments?: Array<{ file_url: string; filename: string; mime_type: string }>
}
```

**Send flow with attachments:**
1. For each attachment, fetch the file from Supabase Storage using service role
2. Convert to base64
3. Include in Missive draft payload:
```typescript
const draftPayload = {
  send: true,
  account: MISSIVE_MESSENGER_ACCOUNT_ID,
  body: content,
  to_fields: [{ id: contactPlatformId }],
  conversation: conversation.missive_conversation_id,
  attachments: attachments.map(a => ({
    base64: base64Data,
    filename: a.filename,
    media_type: a.mime_type,
  })),
}
```
4. Store the attachments array in the `messages.attachments` column

### Message Composer UI Changes

**File: `src/components/messaging/message-composer.tsx`**

Current layout:
```
[Textarea                    ] [Send]
```

New layout:
```
[Attachment previews (if any)          ]
[Textarea                    ] [Send]
[📎 Attach] [💬 Responses] [📦 Inventory]
```

- **Props change**: `onSend: (content: string, attachments?: MessageAttachment[]) => void`
- **State**: `attachments: MessageAttachment[]` — files queued for send
- **Paperclip button**: Opens native file picker, uploads to `messaging-attachments` bucket
- **Attachment preview**: Row of thumbnails (images) or file chips (non-images) with X to remove
- **Max attachments**: 5 per message
- **Max file size**: 10MB per file (Missive limit for Messenger)

### Files to modify
- `supabase/migrations/` — new migration for columns
- `supabase/functions/send-message/index.ts` — attachment handling
- `src/components/messaging/message-composer.tsx` — toolbar + file upload
- `src/hooks/use-messaging.ts` — update `useSendMessage` mutation
- `src/services/messaging.ts` — update `sendMessage` function signature
- `src/lib/types.ts` — add `MessageAttachment` type

---

## Part 2: Canned Responses Panel

### UI Design

**Trigger**: "Responses" button in composer toolbar opens a slide-out panel (or large popover).

**Panel layout** (mirrors Missive's screenshot):
```
┌─────────────────────────────────────────────────┐
│ Responses                               [X]     │
├─────────────────────┬───────────────────────────┤
│ 🔍 Search           │ Title                     │
│                     │ ─────────────────────     │
│ Acctg: Payment... 📎│ [Content preview with     │
│ Acctg: PayPal... 📎 │  full template text and   │
│ Concern: Redel...   │  variable placeholders]   │
│ Info: Express...  📎│                           │
│ Info: Ranking...  📎│                           │
│ Lost                │                           │
│ Order: Confirm...   │                           │
│ Order: Offer...   📎│                           │
│                     │ [attachment.png]     1.3MB │
│                     │                           │
├─────────────────────┴───────────────────────────┤
│ [+ Create new]              [Insert] [Send now] │
└─────────────────────────────────────────────────┘
```

- **Left list**: Response names with preview snippet, 📎 icon if has attachments
- **Right detail**: Full content, attachments shown as file cards
- **Search**: Filters by name and content
- **Shared scope only** (no personal/org split — all agents see all responses)

### Creating/editing a response

In-panel form:
- **Name** (required): e.g. "Acctg: PayPal Payment"
- **Content** (required): Rich text area with `{{variable}}` support
  - Available variables shown as hint chips: `{{customer_name}}`, `{{customer_code}}`, `{{order_code}}`
- **Attachments**: Drag & drop or click to upload (stored in `messaging-attachments/templates/`)
- **Active toggle**: Enable/disable without deleting

### Variable Resolution

When inserting or sending, variables resolve from the current conversation context:
- `{{customer_name}}` → `customers.first_name` (from linked customer)
- `{{customer_code}}` → `customers.customer_code`
- `{{order_code}}` → most recent order's `order_code` for that customer
- Unresolved variables left as-is (agent can manually fill)

### Insert vs Send Now

- **Insert**: Populates compose textarea with resolved content + adds template attachments to attachment queue. Agent can edit before sending.
- **Send Now**: Resolves variables, attaches files, calls `send-message` immediately. Panel closes, toast confirms.

### Database changes

```sql
ALTER TABLE messaging_templates ADD COLUMN attachments JSONB DEFAULT '[]';
-- (Already added in Part 1 migration)
```

No `scope` or `created_by` needed (shared only).

### Files to create/modify
- `src/components/messaging/canned-responses-panel.tsx` — **new** panel component
- `src/components/messaging/canned-response-form.tsx` — **new** create/edit form
- `src/services/messaging.ts` — template CRUD already exists, may need minor updates
- `src/hooks/use-messaging.ts` — template hooks already exist

---

## Part 3: Inventory Search & Insert

### UI Design

**Trigger**: "Inventory" button in composer toolbar opens a modal dialog.

**Modal layout** (mirrors Admin Items Available table, simplified):
```
┌──────────────────────────────────────────────────────┐
│ Search Inventory                              [X]    │
├──────────────────────────────────────────────────────┤
│ 🔍 Search by code or description...                  │
├──────┬──────────┬──────┬─────────────────┬───────────┤
│ IMG  │ Code     │ Rank │ Description     │ Price     │
├──────┼──────────┼──────┼─────────────────┼───────────┤
│ [📷] │ P000417  │ A    │ iPhone 11 64GB  │ ¥24,800   │
│      │          │      │                 │ [Add ➜]   │
├──────┼──────────┼──────┼─────────────────┼───────────┤
│ [📷] │ P000418  │ B    │ iPhone 11 64GB  │ ¥21,000   │
│      │          │      │                 │ [Add ➜]   │
├──────┼──────────┼──────┼─────────────────┼───────────┤
│ [📷] │ A000012  │ —    │ USB-C Cable 1m  │ ¥980      │
│      │          │      │                 │ [Add ➜]   │
└──────┴──────────┴──────┴─────────────────┴───────────┘
```

### Search Logic

- **Items (P-code)**: `item_status = 'AVAILABLE'`, join `product_models` for brand/model/specs
- **Accessories (A-code)**: `stock_quantity > 0`
- Search fields: `item_code`, `accessory_code`, `brand`, `model_name`, `short_description`
- Debounced search (300ms)
- Results sorted: exact code match first, then alphabetical by brand/model

### "Add to Message" Action

When agent clicks "Add to Message" on a row:

1. **Resolve photo**:
   - P-code: `product_media` (hero role) → fallback to `item_media` → fallback to `photo_group_media`
   - A-code: `accessory_media` (first by sort_order)

2. **Attach photo**: Download from Supabase Storage, add to compose attachment queue

3. **Insert text** into compose textarea:
   ```
   [P000417] iPhone 11 64GB - Grade A
   Price: ¥24,800
   View details: https://your-domain.com/shop/product/{product_model_id}
   ```
   For accessories:
   ```
   [A000012] USB-C Cable 1m
   Price: ¥980
   View details: https://your-domain.com/shop/accessory/{accessory_id}
   ```

4. **Close modal** (or stay open for adding multiple items)

### Description Format

Uses existing `buildShortDescription()` utility from `src/lib/utils.ts`:
- Items: `{brand} {model_name} {storage_gb}GB` (or similar based on category description_fields)
- Accessories: `{name}`

### Shop Link

Uses existing shop routes:
- Products: `/shop/product/{product_model_id}`
- Accessories: `/shop/accessory/{accessory_id}`

The base URL will need to be configurable (environment variable: `VITE_PUBLIC_SHOP_URL`).

### Files to create/modify
- `src/components/messaging/inventory-search-modal.tsx` — **new** modal component
- `src/services/items.ts` — add `searchAvailableItems()` function (or reuse existing query patterns)
- `src/hooks/use-items.ts` — add `useAvailableItemsSearch()` hook
- `src/services/accessories.ts` — add `searchAvailableAccessories()` if not exists

---

## Implementation Order

1. **Part 1: Attachments** — DB migration, storage bucket, send-message edge function, composer toolbar
2. **Part 2: Canned Responses** — panel UI, create/edit form, insert/send-now actions
3. **Part 3: Inventory Search** — modal, search queries, add-to-message action

Each part is independently deployable and builds on the previous.

---

## Verification Plan

### Part 1: Attachments
- [ ] Upload a file via paperclip → verify it appears in `messaging-attachments` bucket
- [ ] Send a message with an image attachment → verify it arrives in Messenger with the image visible
- [ ] Send a message with a PDF attachment → verify it arrives as downloadable file
- [ ] Verify attachment preview shows in composer before sending
- [ ] Verify removing an attachment from the queue works
- [ ] Test max file size enforcement (>10MB rejected)

### Part 2: Canned Responses
- [ ] Create a new canned response with text + attachment
- [ ] Search responses by name
- [ ] "Insert" a response → verify textarea populated with resolved variables + attachments queued
- [ ] "Send Now" a response → verify message sent with resolved variables + attachments
- [ ] Edit/delete an existing response
- [ ] Verify unresolved variables (no linked customer) left as `{{variable_name}}`

### Part 3: Inventory Search
- [ ] Search by P-code → exact match appears first
- [ ] Search by brand name → matching available items appear
- [ ] Search by A-code → matching accessories appear
- [ ] "Add to Message" → verify photo attached + formatted text inserted
- [ ] Verify only AVAILABLE items and in-stock accessories show
- [ ] Verify shop link is correct and opens product detail page
- [ ] Test with item that has no photos → graceful fallback (no attachment, text only)
