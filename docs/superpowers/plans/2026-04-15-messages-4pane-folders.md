# Messages 4-Pane Layout with Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Messages page from a 3-pane layout to a 4-pane Missive-style layout with configurable pipeline folders, staff avatars on messages, and a "show mine only" filter.

**Architecture:** New `message_folders` table stores configurable folders (Inbox + pipeline stages). `conversations` gets a `folder_id` FK. Pane 1 is a narrow folder sidebar; Pane 2 is the conversation list filtered by selected folder; Pane 3 is the message thread with sender avatars; Pane 4 is the customer info panel (existing). The `avatar_url` column is added to `conversations` (for customer/contact photos from Missive) and `staff_profiles` (for staff photos). Avatars fall back to initials.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Avatar, ScrollArea, Badge), TanStack Query, Supabase (PostgreSQL + RLS), Zod

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/2026041501_message_folders.sql` | DB: message_folders table, folder_id on conversations, avatar columns, seed data, RLS |
| Create | `src/components/messaging/folder-sidebar.tsx` | Pane 1: folder list with counts, selection state |
| Create | `src/components/messaging/message-avatar.tsx` | Reusable avatar for messages (staff initials/photo, customer initials/photo) |
| Create | `src/services/message-folders.ts` | CRUD for message_folders, move conversation to folder |
| Create | `src/hooks/use-message-folders.ts` | TanStack Query hooks for folders |
| Modify | `src/lib/types.ts` | Add MessageFolder type, update Conversation with folder_id |
| Modify | `src/services/messaging.ts` | Add folder_id filter to getConversations, awaiting-reply count query |
| Modify | `src/hooks/use-messaging.ts` | Update useConversations to accept folder_id filter, add useAwaitingReplyCount |
| Modify | `src/pages/admin/messages.tsx` | 4-pane layout, replace tabs with folder selection, remove stats bar |
| Modify | `src/components/messaging/conversation-list.tsx` | Add "mine only" toggle, show assignment indicator |
| Modify | `src/components/messaging/conversation-thread.tsx` | Add avatars to message bubbles, add folder selector to header |
| Modify | `src/components/messaging/index.ts` | Export new components |

---

### Task 1: Database Migration — Folders Table & Schema Changes

**Files:**
- Create: `supabase/migrations/2026041501_message_folders.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Message folders for pipeline stages
CREATE TABLE message_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'folder',  -- lucide icon name
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,  -- system folders (Inbox) cannot be deleted
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add folder_id to conversations
ALTER TABLE conversations
  ADD COLUMN folder_id uuid REFERENCES message_folders(id) ON DELETE SET NULL;

-- Add avatar_url to conversations (customer/contact photo from Missive)
ALTER TABLE conversations
  ADD COLUMN contact_avatar_url text;

-- Add avatar_url to staff_profiles
ALTER TABLE staff_profiles
  ADD COLUMN avatar_url text;

-- Index for filtering conversations by folder
CREATE INDEX idx_conversations_folder ON conversations(folder_id);

-- RLS for message_folders (staff only, same pattern as other messaging tables)
ALTER TABLE message_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read message folders"
  ON message_folders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can manage message folders"
  ON message_folders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed default folders
INSERT INTO message_folders (name, icon, sort_order, is_system) VALUES
  ('Inbox', 'inbox', 0, true);

INSERT INTO message_folders (name, icon, sort_order, is_system) VALUES
  ('Inquiry', 'message-square', 1, false),
  ('Prospects', 'target', 2, false),
  ('Order', 'shopping-cart', 3, false),
  ('Aftersales', 'package', 4, false),
  ('Concern', 'alert-triangle', 5, false),
  ('Technical', 'wrench', 6, false);

-- Set all existing conversations to Inbox
UPDATE conversations SET folder_id = (
  SELECT id FROM message_folders WHERE name = 'Inbox' LIMIT 1
);

-- Add realtime for message_folders
ALTER PUBLICATION supabase_realtime ADD TABLE message_folders;

-- Updated_at trigger for message_folders
CREATE TRIGGER set_message_folders_updated_at
  BEFORE UPDATE ON message_folders
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: Migration applies successfully, message_folders table created with 7 rows, conversations.folder_id and conversations.contact_avatar_url columns added, staff_profiles.avatar_url column added.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026041501_message_folders.sql
git commit -m "feat: add message_folders table and folder_id to conversations"
```

---

### Task 2: Types & Service Layer for Folders

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/services/message-folders.ts`
- Create: `src/hooks/use-message-folders.ts`

- [ ] **Step 1: Add MessageFolder type to types.ts**

Add after the existing `Conversation` interface (around line 281):

```typescript
export interface MessageFolder {
  id: string
  name: string
  icon: string
  sort_order: number
  is_system: boolean
  created_at: string
  updated_at: string
}
```

Update the `Conversation` interface to add:
```typescript
  folder_id: string | null
  contact_avatar_url: string | null
```

Update the `StaffProfile` interface to add:
```typescript
  avatar_url: string | null
```

- [ ] **Step 2: Create message-folders service**

Create `src/services/message-folders.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import type { MessageFolder } from '@/lib/types'

export async function getMessageFolders(): Promise<MessageFolder[]> {
  const { data, error } = await supabase
    .from('message_folders')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getAwaitingReplyCounts(): Promise<Record<string, number>> {
  // Count conversations per folder where the last message is from the customer
  // and no staff/assistant message has been sent after it
  const { data, error } = await supabase.rpc('get_awaiting_reply_counts')

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.folder_id] = row.count
  }
  return counts
}

export async function createMessageFolder(
  folder: Pick<MessageFolder, 'name' | 'icon' | 'sort_order'>
): Promise<MessageFolder> {
  const { data, error } = await supabase
    .from('message_folders')
    .insert(folder)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateMessageFolder(
  id: string,
  updates: Partial<Pick<MessageFolder, 'name' | 'icon' | 'sort_order'>>
): Promise<MessageFolder> {
  const { data, error } = await supabase
    .from('message_folders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteMessageFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('message_folders')
    .delete()
    .eq('id', id)
    .eq('is_system', false) // prevent deleting system folders

  if (error) throw error
}

export async function moveConversationToFolder(
  conversationId: string,
  folderId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ folder_id: folderId })
    .eq('id', conversationId)

  if (error) throw error
}
```

- [ ] **Step 3: Create use-message-folders hook**

Create `src/hooks/use-message-folders.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as folderService from '@/services/message-folders'

export function useMessageFolders() {
  return useQuery({
    queryKey: ['message-folders'],
    queryFn: folderService.getMessageFolders,
  })
}

export function useAwaitingReplyCounts() {
  return useQuery({
    queryKey: ['message-folders', 'awaiting-reply-counts'],
    queryFn: folderService.getAwaitingReplyCounts,
    refetchInterval: 30_000,
  })
}

export function useMoveConversationToFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, folderId }: { conversationId: string; folderId: string }) =>
      folderService.moveConversationToFolder(conversationId, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}

export function useCreateMessageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: folderService.createMessageFolder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}

export function useDeleteMessageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: folderService.deleteMessageFolder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-folders'] })
    },
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (types may not be used yet, but should compile)

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/services/message-folders.ts src/hooks/use-message-folders.ts
git commit -m "feat: add message folder types, service, and hooks"
```

---

### Task 3: Database Function for Awaiting Reply Counts

**Files:**
- Create: `supabase/migrations/2026041502_awaiting_reply_counts_rpc.sql`

- [ ] **Step 1: Write the RPC function migration**

```sql
-- RPC to get count of conversations awaiting staff reply per folder
-- A conversation is "awaiting reply" if its most recent message is from the customer
CREATE OR REPLACE FUNCTION get_awaiting_reply_counts()
RETURNS TABLE(folder_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.folder_id,
    COUNT(*)::bigint AS count
  FROM conversations c
  WHERE c.folder_id IS NOT NULL
    AND EXISTS (
      -- The most recent message in this conversation is from the customer
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id
        AND m.role = 'customer'
        AND m.status = 'SENT'
        AND NOT EXISTS (
          SELECT 1 FROM messages m2
          WHERE m2.conversation_id = c.id
            AND m2.role IN ('staff', 'assistant')
            AND m2.status = 'SENT'
            AND m2.created_at > m.created_at
        )
    )
  GROUP BY c.folder_id;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: Function created successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026041502_awaiting_reply_counts_rpc.sql
git commit -m "feat: add get_awaiting_reply_counts RPC function"
```

---

### Task 4: Update Messaging Service & Hooks for Folder Filtering

**Files:**
- Modify: `src/services/messaging.ts`
- Modify: `src/hooks/use-messaging.ts`

- [ ] **Step 1: Add folder_id filter to getConversations**

In `src/services/messaging.ts`, find the `ConversationFilters` interface (around line 23) and add `folder_id`:

```typescript
export interface ConversationFilters {
  needs_review?: boolean
  assigned_staff_id?: string
  search?: string
  folder_id?: string        // NEW
  mine_only?: boolean       // NEW — filter by assigned_staff_id matching current user
}
```

In the `getConversations` function, add the folder filter after existing filters:

```typescript
  if (filters.folder_id) {
    query = query.eq('folder_id', filters.folder_id)
  }
```

- [ ] **Step 2: Update useConversations hook**

In `src/hooks/use-messaging.ts`, the `useConversations` hook already accepts `ConversationFilters`. Update its query key to include `folder_id`:

Find the existing queryKey (something like `['conversations', filters]`) — it should already spread filters into the key, so no change needed if it uses the full filters object. Verify this is the case.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/services/messaging.ts src/hooks/use-messaging.ts
git commit -m "feat: add folder_id and mine_only filters to conversation queries"
```

---

### Task 5: Folder Sidebar Component (Pane 1)

**Files:**
- Create: `src/components/messaging/folder-sidebar.tsx`

- [ ] **Step 1: Create the folder sidebar component**

```typescript
import { memo } from 'react'
import {
  Inbox,
  MessageSquare,
  Target,
  ShoppingCart,
  Package,
  AlertTriangle,
  Wrench,
  Folder,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MessageFolder } from '@/lib/types'

const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  'message-square': MessageSquare,
  target: Target,
  'shopping-cart': ShoppingCart,
  package: Package,
  'alert-triangle': AlertTriangle,
  wrench: Wrench,
  folder: Folder,
}

interface FolderSidebarProps {
  folders: MessageFolder[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string) => void
  awaitingCounts: Record<string, number>
}

export const FolderSidebar = memo(function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  awaitingCounts,
}: FolderSidebarProps) {
  // Separate system folders (Inbox) from pipeline folders
  const systemFolders = folders.filter((f) => f.is_system)
  const pipelineFolders = folders.filter((f) => !f.is_system)

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r bg-muted/30">
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* System folders */}
          {systemFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              isSelected={folder.id === selectedFolderId}
              awaitingCount={awaitingCounts[folder.id] ?? 0}
              onSelect={onSelectFolder}
            />
          ))}

          {/* Pipeline section */}
          {pipelineFolders.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pipeline
                </span>
              </div>
              {pipelineFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isSelected={folder.id === selectedFolderId}
                  awaitingCount={awaitingCounts[folder.id] ?? 0}
                  onSelect={onSelectFolder}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
})

function FolderItem({
  folder,
  isSelected,
  awaitingCount,
  onSelect,
}: {
  folder: MessageFolder
  isSelected: boolean
  awaitingCount: number
  onSelect: (id: string) => void
}) {
  const Icon = ICON_MAP[folder.icon] ?? Folder

  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isSelected ? 'bg-accent font-medium' : 'hover:bg-muted/80 text-muted-foreground',
      )}
      onClick={() => onSelect(folder.id)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate flex-1 text-left">{folder.name}</span>
      {awaitingCount > 0 && (
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] font-semibold">
          {awaitingCount}
        </Badge>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Export from index**

In `src/components/messaging/index.ts`, add:

```typescript
export { FolderSidebar } from './folder-sidebar'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/messaging/folder-sidebar.tsx src/components/messaging/index.ts
git commit -m "feat: add FolderSidebar component for message pipeline folders"
```

---

### Task 6: Message Avatar Component

**Files:**
- Create: `src/components/messaging/message-avatar.tsx`

- [ ] **Step 1: Create the message avatar component**

This component renders a small avatar next to message bubbles. For staff, it shows their initials (from `display_name`) or avatar_url. For customers, it shows initials from the conversation's contact name or customer name, or contact_avatar_url if available.

```typescript
import { memo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bot } from 'lucide-react'
import type { MessageRole } from '@/lib/types'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name[0] ?? '?').toUpperCase()
}

interface MessageAvatarProps {
  role: MessageRole
  /** Staff display_name or customer name */
  name: string
  /** URL for the avatar image (staff avatar_url or conversation contact_avatar_url) */
  avatarUrl?: string | null
}

export const MessageAvatar = memo(function MessageAvatar({
  role,
  name,
  avatarUrl,
}: MessageAvatarProps) {
  if (role === 'assistant') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
    )
  }

  return (
    <Avatar size="sm">
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="text-[10px]">{getInitials(name)}</AvatarFallback>
    </Avatar>
  )
})
```

- [ ] **Step 2: Export from index**

In `src/components/messaging/index.ts`, add:

```typescript
export { MessageAvatar } from './message-avatar'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/messaging/message-avatar.tsx src/components/messaging/index.ts
git commit -m "feat: add MessageAvatar component for message bubbles"
```

---

### Task 7: Update Conversation Thread with Avatars

**Files:**
- Modify: `src/components/messaging/conversation-thread.tsx`

- [ ] **Step 1: Add avatar props and imports**

Add to the imports at the top of `conversation-thread.tsx`:

```typescript
import { MessageAvatar } from './message-avatar'
```

Update `ConversationThreadProps` to add:

```typescript
  /** Map of staff user ID → { display_name, avatar_url } for rendering avatars */
  staffMap?: Record<string, { display_name: string; avatar_url: string | null }>
```

- [ ] **Step 2: Add avatars to message bubbles**

Find the message rendering section (around line 366-420). Replace the message bubble wrapper to include avatars. The current code is:

```tsx
<div
  key={msg.id}
  className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}
>
  <div
    className={cn(
      'max-w-[80%] rounded-lg px-3 py-2 text-sm',
      ...
    )}
  >
```

Replace with:

```tsx
<div
  key={msg.id}
  className={cn('flex items-end gap-2', isCustomer ? 'justify-start' : 'justify-end')}
>
  {isCustomer && (
    <MessageAvatar
      role="customer"
      name={customerName}
      avatarUrl={conversation.contact_avatar_url}
    />
  )}
  <div
    className={cn(
      'max-w-[75%] rounded-lg px-3 py-2 text-sm',
      isCustomer
        ? 'bg-muted'
        : 'bg-primary text-primary-foreground',
    )}
  >
    {/* For staff messages, show sender name above the bubble */}
    {msg.role === 'staff' && msg.sent_by && staffMap?.[msg.sent_by] && (
      <p className="text-[10px] font-medium text-primary-foreground/70 mb-0.5">
        {staffMap[msg.sent_by].display_name}
      </p>
    )}
    {/* ...existing content (msg.content, attachments, timestamp, status)... */}
```

After the closing `</div>` of the bubble, add the staff/AI avatar on the right side:

```tsx
  {!isCustomer && (
    <MessageAvatar
      role={msg.role}
      name={msg.sent_by && staffMap?.[msg.sent_by] ? staffMap[msg.sent_by].display_name : 'AI'}
      avatarUrl={msg.sent_by && staffMap?.[msg.sent_by] ? staffMap[msg.sent_by].avatar_url : null}
    />
  )}
</div>
```

- [ ] **Step 3: Add folder selector to thread header**

In the thread header section (around line 290-310), add a folder selector dropdown. Import `useMoveConversationToFolder` and `useMessageFolders` in the parent page and pass down as props, OR add a simple `onMoveToFolder` callback prop:

Add to `ConversationThreadProps`:
```typescript
  folders?: MessageFolder[]
  onMoveToFolder?: (folderId: string) => void
```

In the header, after the AI toggle and before the closing `</div>`, add:

```tsx
{folders && folders.length > 0 && onMoveToFolder && (
  <Select
    value={conversation.folder_id ?? ''}
    onValueChange={(v) => onMoveToFolder(v)}
  >
    <SelectTrigger className="h-8 w-[140px] text-xs">
      <SelectValue placeholder="Move to folder..." />
    </SelectTrigger>
    <SelectContent>
      {folders.map((f) => (
        <SelectItem key={f.id} value={f.id}>
          {f.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/conversation-thread.tsx
git commit -m "feat: add avatars to message bubbles and folder selector to thread header"
```

---

### Task 8: Update Conversation List with Mine Toggle & Assignment Indicator

**Files:**
- Modify: `src/components/messaging/conversation-list.tsx`

- [ ] **Step 1: Add "mine only" toggle and assignment indicator**

Update `ConversationListProps`:

```typescript
interface ConversationListProps {
  conversations: ConversationWithRelations[]
  selectedId: string | null
  onSelect: (id: string) => void
  onLinkCustomer?: (conversationId: string, customerId: string) => void
  mineOnly: boolean                    // NEW
  onToggleMineOnly: (v: boolean) => void // NEW
  staffMap?: Record<string, { display_name: string; avatar_url: string | null }> // NEW
  currentUserId?: string               // NEW
}
```

Add a header section above the ScrollArea with search and mine toggle:

```tsx
<div className="flex items-center gap-2 p-2 border-b">
  <SearchBar value={search} onChange={onSearchChange} placeholder="Search..." className="flex-1" />
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={mineOnly ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onToggleMineOnly(!mineOnly)}
      >
        <UserCheck className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      {mineOnly ? 'Showing mine only' : 'Show mine only'}
    </TooltipContent>
  </Tooltip>
</div>
```

In each conversation item, after the channel badge, add an assignment indicator:

```tsx
{conv.assigned_staff_id && staffMap?.[conv.assigned_staff_id] && (
  <span className="text-[10px] text-muted-foreground">
    {staffMap[conv.assigned_staff_id].display_name.split(' ')[0]}
  </span>
)}
```

Note: The search bar and its state will need to be lifted. The `search` and `onSearchChange` props must be added to ConversationListProps since search is moving from the page header into this component's header area:

```typescript
  search: string                       // NEW
  onSearchChange: (v: string) => void  // NEW
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/messaging/conversation-list.tsx
git commit -m "feat: add mine-only toggle and assignment indicator to conversation list"
```

---

### Task 9: Rewrite Messages Page with 4-Pane Layout

**Files:**
- Modify: `src/pages/admin/messages.tsx`

This is the main integration task. The page goes from 3 panes to 4 panes:

```
[Folder Sidebar 192px] | [Conv List 300px] | [Thread flex-1] | [Customer Panel 300px]
```

- [ ] **Step 1: Update imports and state**

Remove stats-related imports (`Bot`, `Send`, `TrendingUp`, `AlertTriangle` stat icons, `useMessagingStats`).

Add new imports:

```typescript
import { FolderSidebar } from '@/components/messaging/folder-sidebar'
import { useMessageFolders, useAwaitingReplyCounts, useMoveConversationToFolder } from '@/hooks/use-message-folders'
```

Replace the tab/filter state with folder state:

```typescript
// Remove:
const [tab, setTab] = useState<FilterTab>('needs_review')

// Add:
const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
const [mineOnly, setMineOnly] = useState(false)

const { data: folders = [] } = useMessageFolders()
const { data: awaitingCounts = {} } = useAwaitingReplyCounts()
const moveToFolder = useMoveConversationToFolder()
```

Auto-select Inbox folder on first load:

```typescript
useEffect(() => {
  if (!selectedFolderId && folders.length > 0) {
    const inbox = folders.find((f) => f.is_system && f.name === 'Inbox')
    setSelectedFolderId(inbox?.id ?? folders[0].id)
  }
}, [folders, selectedFolderId])
```

Update the conversation filters:

```typescript
// Remove the old filter logic based on tabs
// Replace with:
const filters: ConversationFilters = {
  folder_id: selectedFolderId ?? undefined,
  search: search || undefined,
  assigned_staff_id: mineOnly ? user?.id : undefined,
}
```

Build the staffMap for avatars:

```typescript
const staffMap = useMemo(() => {
  const map: Record<string, { display_name: string; avatar_url: string | null }> = {}
  for (const s of staffMembers) {
    map[s.id] = { display_name: s.display_name, avatar_url: s.avatar_url ?? null }
  }
  return map
}, [staffMembers])
```

- [ ] **Step 2: Rewrite the JSX layout**

Replace the entire return JSX with the 4-pane layout:

```tsx
return (
  <div className="flex flex-col h-[calc(100vh-5rem)]">
    <PageHeader
      title="Messages"
      description="Customer conversations via Missive"
    />

    <div className="flex flex-1 min-h-0 mt-4 rounded-lg border bg-card overflow-hidden">
      {/* Pane 1 — Folder sidebar */}
      <FolderSidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        awaitingCounts={awaitingCounts}
      />

      {/* Pane 2 — Conversation list */}
      <div className="flex w-[300px] shrink-0 flex-col border-r min-h-0">
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
          onLinkCustomer={handleLinkCustomerFromList}
          mineOnly={mineOnly}
          onToggleMineOnly={setMineOnly}
          staffMap={staffMap}
          currentUserId={user?.id}
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      {/* Pane 3 — Conversation thread */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedConversation ? (
          <ConversationThread
            conversation={selectedConversation}
            messages={messages}
            onSend={handleSend}
            onApproveDraft={handleApproveDraft}
            onRejectDraft={handleRejectDraft}
            onRetryMessage={handleRetryMessage}
            onLinkCustomer={handleLinkCustomer}
            onToggleAi={handleToggleAi}
            onAssignStaff={handleAssignStaff}
            staffMembers={staffMembers}
            currentUserId={user?.id}
            isSending={sendMutation.isPending}
            staffMap={staffMap}
            folders={folders}
            onMoveToFolder={(folderId) =>
              moveToFolder.mutate(
                { conversationId: selectedConvId!, folderId },
                { onSuccess: () => toast.success('Moved to folder') }
              )
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>

      {/* Pane 4 — Customer info panel */}
      {selectedConversation && (
        <CustomerPanel
          conversation={selectedConversation}
          isExpanded={panelExpanded}
          onToggle={() => setPanelExpanded(!panelExpanded)}
        />
      )}
    </div>
  </div>
)
```

- [ ] **Step 3: Remove unused code**

Remove:
- The `FilterTab` type and tab state
- The stats bar JSX (`stats && (...)` block)
- The `useMessagingStats` hook call
- The `Tabs`, `TabsList`, `TabsTrigger` imports if no longer used
- The `needsReviewCount` logic (unless still wanted elsewhere)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/messages.tsx
git commit -m "feat: rewrite messages page with 4-pane layout and folder navigation"
```

---

### Task 10: Missive Webhook — Store Contact Avatar URL

**Files:**
- Modify: `supabase/functions/missive-webhook/index.ts`

- [ ] **Step 1: Extract and store contact avatar from Missive webhook payload**

Missive webhook payloads include contact data. When processing incoming messages, check if the contact has a `twitter_avatar` or `avatar` field and store it in `conversations.contact_avatar_url`.

Find the section where the conversation is created or updated (where `contact_name` is set), and add:

```typescript
// Extract avatar URL from Missive contact data if available
const contactAvatar = contact?.avatar ?? contact?.twitter_avatar ?? null

// When upserting conversation, include contact_avatar_url
const conversationUpdate = {
  // ...existing fields...
  contact_avatar_url: contactAvatar,
}
```

Note: This depends on the Missive API payload structure. If `avatar` is not in the webhook payload, we may need to fetch it via the Missive REST API (`GET /contacts/:id`). Check the webhook payload first — if avatar is not present, skip this task and use initials fallback for now.

- [ ] **Step 2: Verify the Edge Function deploys**

Run: `supabase functions deploy missive-webhook`
Expected: Deploys successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/missive-webhook/index.ts
git commit -m "feat: store contact avatar URL from Missive webhook"
```

---

### Task 11: Integration Testing & Polish

**Files:**
- Modify: Various — bug fixes found during testing

- [ ] **Step 1: Manual smoke test checklist**

Open the app in browser and verify:

1. Folder sidebar renders with Inbox + 6 pipeline folders
2. Clicking a folder filters the conversation list
3. Awaiting reply count shows next to each folder
4. "Mine only" toggle filters to assigned conversations
5. Selecting a conversation shows the thread with avatars on messages
6. Staff name appears above staff message bubbles
7. Customer avatar/initials appear on left side of customer messages
8. Folder selector in thread header moves conversation between folders
9. Moving a conversation updates the folder counts
10. Customer panel still works (expand/collapse, customer details)
11. Search within conversation list works
12. Assignment dropdown in thread header still works
13. Real-time updates still work (new messages appear)

- [ ] **Step 2: Fix any issues found**

Address layout, overflow, or data issues discovered during testing.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: polish 4-pane messages layout and fix integration issues"
```
