# AI Training & Memory — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff curate the AI's memory — a "Correct this" button on AI drafts and a Training page in Messaging Settings to review, approve, promote, and manually add corrections. Approving a correction generates its embedding so the backend can retrieve it.

**Architecture:** React 18 + TanStack Query following the existing Messaging Settings patterns (plain `useState` forms like `KbEntryFormDialog`, KB-style service CRUD + hooks). A small `embed-correction` edge function fills the embedding on approval (browsers can't run `gte-small`). Promotion writes a tagged `knowledge_base` article, reusing the existing always-inject machinery.

**Tech Stack:** React + Vite + TS, TanStack Query, shadcn/ui, `sonner` toasts; `node:assert` script for the one pure helper (repo has no component-test framework); Supabase CLI for the edge-function deploy.

**Depends on:** `docs/superpowers/plans/2026-07-02-ai-training-memory-backend.md` (the `ai_corrections` table, `match_ai_corrections` RPC, and `_shared/embeddings.ts` must exist and be deployed first).
**Companion spec:** `docs/superpowers/specs/2026-07-02-ai-training-memory-design.md`

---

## File structure

**Create:**
- `supabase/functions/embed-correction/index.ts` — embeds a correction's `customer_message` and stores it.
- `src/lib/corrections.ts` — pure helper `findCustomerMessageForDraft()`.
- `src/lib/corrections.test.ts` — its `node:assert` test.
- `src/components/messaging/correct-draft-dialog.tsx` — the "Correct this" capture dialog.

**Modify:**
- `src/lib/types.ts` — `AiCorrection`, `AiCorrectionInsert`, `AiCorrectionUpdate`.
- `src/lib/query-keys.ts` — `messaging.corrections()` key.
- `src/services/messaging.ts` — corrections CRUD + `approveCorrection` (+embed) + `promoteCorrection`.
- `src/hooks/use-messaging.ts` — corrections hooks.
- `src/components/messaging/ai-draft-card.tsx` — "Correct this" button + `onCorrect` prop.
- `src/components/messaging/conversation-thread.tsx` — thread `onCorrectDraft` through.
- `src/pages/admin/messages.tsx` — wire `onCorrectDraft` + render `CorrectDraftDialog`.
- `src/pages/admin/messaging-settings.tsx` — new "AI Training" card + review/promote actions + add dialog.

---

## Task B.0: Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the types.** Add near the other messaging types in `src/lib/types.ts`:

```typescript
export type AiCorrectionStatus = 'PENDING' | 'APPROVED' | 'PROMOTED' | 'REJECTED'

export interface AiCorrection {
  id: string
  customer_message: string
  wrong_reply: string | null
  correct_reply: string
  note: string | null
  specialist_slug: string | null
  sub_intent_slug: string | null
  status: AiCorrectionStatus
  source_conversation_id: string | null
  source_message_id: string | null
  promoted_knowledge_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AiCorrectionInsert {
  customer_message: string
  wrong_reply?: string | null
  correct_reply: string
  note?: string | null
  specialist_slug?: string | null
  sub_intent_slug?: string | null
  status?: AiCorrectionStatus
  source_conversation_id?: string | null
  source_message_id?: string | null
}

export interface AiCorrectionUpdate {
  customer_message?: string
  wrong_reply?: string | null
  correct_reply?: string
  note?: string | null
  specialist_slug?: string | null
  status?: AiCorrectionStatus
  promoted_knowledge_id?: string | null
}
```

(Note: `src/lib/types.ts` is hand-maintained over `database.types.ts` — do NOT regenerate it. Add these by hand.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(messaging): AiCorrection types"
```

---

## Task B.1: `embed-correction` edge function

**Files:**
- Create: `supabase/functions/embed-correction/index.ts`

- [ ] **Step 1: Create the function.** It reuses the guarded `embed()` from Task 2.2 of the backend plan.

Create `supabase/functions/embed-correction/index.ts`:

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import { embed } from "../_shared/embeddings.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { id } = await req.json();
    if (!id) return json({ error: "missing id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error: readErr } = await supabase
      .from("ai_corrections").select("id, customer_message").eq("id", id).single();
    if (readErr || !row) return json({ error: `correction not found: ${readErr?.message ?? "unknown"}` }, 404);

    const embedding = await embed(row.customer_message as string);
    if (!embedding) return json({ error: "embedding unavailable in this runtime" }, 503);

    const { error: updErr } = await supabase
      .from("ai_corrections").update({ embedding }).eq("id", id);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy embed-correction`
Expected: deploys successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/embed-correction/index.ts
git commit -m "feat(messaging): embed-correction edge function (gte-small)"
```

---

## Task B.2: Service functions

**Files:**
- Modify: `src/lib/query-keys.ts`, `src/services/messaging.ts`

- [ ] **Step 1: Add the query key.** In `src/lib/query-keys.ts`, inside the `messaging` object (after `specialists:`), add:

```typescript
    corrections: () => [...queryKeys.messaging.all, 'corrections'] as const,
```

- [ ] **Step 2: Add the service functions.** Append to `src/services/messaging.ts` (mirroring the Knowledge Base CRUD shape):

```typescript
// ---------- AI Corrections (Training) ----------

export async function getAiCorrections() {
  const { data, error } = await supabase
    .from('ai_corrections')
    .select('id, customer_message, wrong_reply, correct_reply, note, specialist_slug, sub_intent_slug, status, source_conversation_id, source_message_id, promoted_knowledge_id, created_by, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AiCorrection[]
}

export async function createAiCorrection(entry: AiCorrectionInsert) {
  const { data, error } = await supabase
    .from('ai_corrections')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data as AiCorrection
}

export async function updateAiCorrection(id: string, updates: AiCorrectionUpdate) {
  const { data, error } = await supabase
    .from('ai_corrections')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as AiCorrection
}

export async function deleteAiCorrection(id: string) {
  const { error } = await supabase.from('ai_corrections').delete().eq('id', id)
  if (error) throw error
}

// Approve a correction and generate its embedding so the backend can retrieve it.
export async function approveAiCorrection(id: string) {
  const { error } = await supabase.from('ai_corrections').update({ status: 'APPROVED' }).eq('id', id)
  if (error) throw error
  // Non-fatal if embedding is unavailable — it can be re-approved later to retry.
  const { error: embedErr } = await supabase.functions.invoke('embed-correction', { body: { id } })
  if (embedErr) throw new Error(`Approved, but embedding failed: ${embedErr.message}`)
}

// Promote an APPROVED correction into a durable, always-injected knowledge_base article,
// then mark it PROMOTED and link it.
export async function promoteAiCorrection(correction: AiCorrection) {
  const title = `Correction: ${correction.customer_message.slice(0, 60)}`
  const kb = await createKnowledgeBaseEntry({
    entry_type: 'knowledge',
    title,
    content: correction.correct_reply,
    category: 'Custom',
    is_active: true,
    specialist_tags: correction.specialist_slug ? [correction.specialist_slug] : [],
  } as KnowledgeBaseEntryInsert)
  await updateAiCorrection(correction.id, { status: 'PROMOTED', promoted_knowledge_id: kb.id })
  return kb
}
```

- [ ] **Step 3: Add the type import.** Ensure `src/services/messaging.ts` imports the new types (add to its existing `@/lib/types` import): `AiCorrection, AiCorrectionInsert, AiCorrectionUpdate`. `KnowledgeBaseEntryInsert` should already be imported (used by `createKnowledgeBaseEntry`).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/services/messaging.ts
git commit -m "feat(messaging): ai_corrections service functions + promote/approve"
```

---

## Task B.3: Hooks

**Files:**
- Modify: `src/hooks/use-messaging.ts`

- [ ] **Step 1: Add the hooks.** Append to `src/hooks/use-messaging.ts` (mirroring the KB hooks; each invalidates `queryKeys.messaging.corrections()`):

```typescript
// ---------- AI Corrections (Training) ----------

export function useAiCorrections() {
  return useQuery({
    queryKey: queryKeys.messaging.corrections(),
    queryFn: () => messagingService.getAiCorrections(),
  })
}

export function useCreateAiCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: AiCorrectionInsert) => messagingService.createAiCorrection(entry),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.messaging.corrections() }),
  })
}

export function useUpdateAiCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: AiCorrectionUpdate }) =>
      messagingService.updateAiCorrection(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.messaging.corrections() }),
  })
}

export function useDeleteAiCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteAiCorrection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.messaging.corrections() }),
  })
}

export function useApproveAiCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.approveAiCorrection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.messaging.corrections() }),
  })
}

export function usePromoteAiCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (correction: AiCorrection) => messagingService.promoteAiCorrection(correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.corrections() })
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.knowledgeBase() })
    },
  })
}
```

- [ ] **Step 2: Add type imports.** Ensure `use-messaging.ts` imports `AiCorrection, AiCorrectionInsert, AiCorrectionUpdate` from `@/lib/types`.

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` (expect no errors), then:
```bash
git add src/hooks/use-messaging.ts
git commit -m "feat(messaging): ai_corrections hooks"
```

---

## Task B.4: Pure helper — find the customer message a draft replied to

**Files:**
- Create: `src/lib/corrections.ts`, `src/lib/corrections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/corrections.test.ts` (mirrors `src/lib/datetime.test.ts` style):

```typescript
import assert from 'node:assert/strict'
import { findCustomerMessageForDraft } from './corrections'

const msgs = [
  { id: 'm1', role: 'customer', content: 'battery percentage po?' },
  { id: 'm2', role: 'assistant', content: 'draft reply' },
] as never[]

assert.equal(findCustomerMessageForDraft(msgs, 'm2'), 'battery percentage po?')
assert.equal(findCustomerMessageForDraft(msgs, 'unknown'), '')
assert.equal(findCustomerMessageForDraft([] as never[], 'm2'), '')

console.log('corrections.test.ts: all assertions passed')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/lib/corrections.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

Create `src/lib/corrections.ts`:

```typescript
import type { Message } from './types'

// Return the content of the customer message immediately preceding a draft (the question the
// draft was answering), or '' if none is found. Used to prefill the "Correct this" dialog.
export function findCustomerMessageForDraft(messages: Message[], draftId: string): string {
  const idx = messages.findIndex((m) => m.id === draftId)
  if (idx < 0) return ''
  for (let i = idx - 1; i >= 0; i--) {
    const role = (messages[i] as { role?: string }).role
    if (role === 'customer' || role === 'user') return messages[i].content ?? ''
  }
  return ''
}
```

(Confirm the inbound-customer role literal against how `missive-webhook` stores messages; the helper accepts both `'customer'` and `'user'`.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx src/lib/corrections.test.ts`
Expected: `corrections.test.ts: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/corrections.ts src/lib/corrections.test.ts
git commit -m "feat(messaging): findCustomerMessageForDraft helper"
```

---

## Task B.5: "Correct this" capture dialog + wiring

**Files:**
- Create: `src/components/messaging/correct-draft-dialog.tsx`
- Modify: `src/components/messaging/ai-draft-card.tsx`, `conversation-thread.tsx`, `src/pages/admin/messages.tsx`

- [ ] **Step 1: Create the dialog.**

Create `src/components/messaging/correct-draft-dialog.tsx`:

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateAiCorrection } from '@/hooks/use-messaging'

interface CorrectDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerMessage: string
  wrongReply: string
  specialistSlug: string | null
  subIntentSlug: string | null
  conversationId: string | null
  messageId: string | null
}

export function CorrectDraftDialog({
  open, onOpenChange, customerMessage, wrongReply, specialistSlug, subIntentSlug, conversationId, messageId,
}: CorrectDraftDialogProps) {
  const [question, setQuestion] = useState(customerMessage)
  const [correct, setCorrect] = useState('')
  const [note, setNote] = useState('')
  const createCorrection = useCreateAiCorrection()

  // Re-seed the editable question when a different draft opens the dialog.
  if (open && question === '' && customerMessage !== '') setQuestion(customerMessage)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !correct.trim()) return
    createCorrection.mutate(
      {
        customer_message: question.trim(),
        wrong_reply: wrongReply || null,
        correct_reply: correct.trim(),
        note: note.trim() || null,
        specialist_slug: specialistSlug,
        sub_intent_slug: subIntentSlug,
        status: 'PENDING',
        source_conversation_id: conversationId,
        source_message_id: messageId,
      },
      {
        onSuccess: () => {
          toast.success('Correction saved for review')
          setCorrect(''); setNote(''); setQuestion('')
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct this AI reply</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Customer question</Label>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="min-h-[60px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label>What the AI said (wrong)</Label>
            <p className="rounded border bg-muted/40 p-2 text-sm whitespace-pre-wrap">{wrongReply || '—'}</p>
          </div>
          <div className="space-y-2">
            <Label>What it should have said</Label>
            <Textarea value={correct} onChange={(e) => setCorrect(e.target.value)} className="min-h-[100px] text-sm" placeholder="The correct reply..." autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Why (optional note)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[50px] text-sm" placeholder="e.g. we always list battery % for laptops" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createCorrection.isPending || !question.trim() || !correct.trim()}>
              Save correction
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Add the "Correct this" button to the draft card.** In `src/components/messaging/ai-draft-card.tsx`:

Add `onCorrect?: () => void` to `AiDraftCardProps`:
```tsx
interface AiDraftCardProps {
  message: Message
  onApprove: (content: string, attachments?: MessageAttachment[]) => void
  onReject: () => void
  onCorrect?: () => void
  isLoading?: boolean
}
```
Destructure `onCorrect` in the component signature. Import `MessageSquareWarning` from `lucide-react` (add to the existing icon import). In the NON-editing button row (the `<>` block with Send/Edit/Reject), add after the Reject button:
```tsx
            {onCorrect && (
              <Button size="xs" variant="outline" onClick={onCorrect} disabled={isLoading}>
                <MessageSquareWarning className="h-3 w-3" />
                Correct
              </Button>
            )}
```

- [ ] **Step 3: Thread the callback through `conversation-thread.tsx`.** Add `onCorrectDraft?: (messageId: string) => void` to `ConversationThreadProps`, destructure it, and in the `<AiDraftCard>` render add:
```tsx
                            onCorrect={onCorrectDraft ? () => onCorrectDraft(msg.id) : undefined}
```

- [ ] **Step 4: Wire it in `messages.tsx`.** Add page state + dialog:
```tsx
  const [correctDraftId, setCorrectDraftId] = useState<string | null>(null)
```
Import the helper + dialog at the top:
```tsx
import { findCustomerMessageForDraft } from '@/lib/corrections'
import { CorrectDraftDialog } from '@/components/messaging/correct-draft-dialog'
```
Pass `onCorrectDraft={setCorrectDraftId}` to `<ConversationThread>`. Then render the dialog near the other dialogs, deriving its props from the currently-loaded messages (`messages` is the thread's message array in this page — use whatever variable holds it) and the selected draft's `ai_context_summary`:
```tsx
      {(() => {
        const draft = messages.find((m) => m.id === correctDraftId)
        let specialist: string | null = null
        let subIntent: string | null = null
        if (draft?.ai_context_summary) {
          try {
            const s = JSON.parse(draft.ai_context_summary as string)
            specialist = s.intent ?? null // specialist slug is derived from intent server-side; store the intent for reference
            subIntent = s.sub_intent_slug ?? null
          } catch { /* ignore */ }
        }
        return (
          <CorrectDraftDialog
            open={!!correctDraftId}
            onOpenChange={(o) => { if (!o) setCorrectDraftId(null) }}
            customerMessage={correctDraftId ? findCustomerMessageForDraft(messages, correctDraftId) : ''}
            wrongReply={draft?.content ?? ''}
            specialistSlug={specialist}
            subIntentSlug={subIntent}
            conversationId={selectedConvId}
            messageId={correctDraftId}
          />
        )
      })()}
```
(If the messages array variable in `messages.tsx` has a different name, use that. `ai_context_summary` stores `intent` and `sub_intent_slug`; the intent maps to a specialist server-side, and `match_ai_corrections` scopes by `specialist_slug` — storing the intent string here is a reasonable scoping key. If exact specialist-slug parity is desired, resolve it in the Training page at approval time instead.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification (repo has no component tests).** Run the app (`/run` skill or `npm run dev`), open a conversation with an AI draft, click **Correct**, fill the form, save. Confirm a `PENDING` row appears:
```sql
SELECT status, customer_message, correct_reply FROM ai_corrections ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 7: Commit**

```bash
git add src/components/messaging/correct-draft-dialog.tsx src/components/messaging/ai-draft-card.tsx src/components/messaging/conversation-thread.tsx src/pages/admin/messages.tsx
git commit -m "feat(messaging): Correct-this capture dialog on AI drafts"
```

---

## Task B.6: Training card in Messaging Settings

**Files:**
- Modify: `src/pages/admin/messaging-settings.tsx`

- [ ] **Step 1: Add imports + a status→variant map.** In the hooks import block add:
```tsx
  useAiCorrections,
  useCreateAiCorrection,
  useUpdateAiCorrection,
  useDeleteAiCorrection,
  useApproveAiCorrection,
  usePromoteAiCorrection,
```
Add to the `@/lib/types` type import: `AiCorrection`. Add `GraduationCap` and `Check`/`X`/`Trash2`/`ArrowUpCircle` (Check/X/Trash2 already imported; add `GraduationCap`, `ArrowUpCircle`) to the `lucide-react` import.

- [ ] **Step 2: Add the card.** Insert this `<Card>` into the page's vertical stack, right after the Knowledge Base card (`</Card>` ~line 1424) and before Company Facts:

```tsx
      {/* AI Training (Corrections) Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                AI Training
              </CardTitle>
              <CardDescription>
                Review staff corrections. Approve to add them to the AI's memory; promote the important ones into permanent Knowledge Base rules.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditCorrection(null); setCorrectionFormOpen(true) }}>
              <Plus className="h-4 w-4" />
              Add Correction
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCorrections ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : corrections.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No corrections yet. Use "Correct" on an AI draft, or add one here.
            </p>
          ) : (
            <div className="space-y-3">
              {corrections.map((c) => (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={c.status === 'PENDING' ? 'secondary' : c.status === 'REJECTED' ? 'outline' : 'default'} className="shrink-0">
                          {c.status}
                        </Badge>
                        {c.specialist_slug && <Badge variant="outline" className="shrink-0">{c.specialist_slug}</Badge>}
                        <p className="text-sm font-medium truncate">{c.customer_message}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">→ {c.correct_reply}</p>
                      {c.note && <p className="text-[11px] text-muted-foreground mt-0.5 italic">Why: {c.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.status === 'PENDING' && (
                        <>
                          <Button size="icon-xs" variant="ghost" title="Approve" onClick={() => handleApproveCorrection(c)} disabled={approveCorrection.isPending}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" title="Reject" onClick={() => handleRejectCorrection(c)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {c.status === 'APPROVED' && (
                        <Button size="icon-xs" variant="ghost" title="Promote to Knowledge Base rule" onClick={() => handlePromoteCorrection(c)} disabled={promoteCorrection.isPending}>
                          <ArrowUpCircle className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => { setEditCorrection(c); setCorrectionFormOpen(true) }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" title="Delete" onClick={() => handleDeleteCorrection(c)} disabled={deleteCorrection.isPending}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 3: Add the page state + hooks + handlers.** In `MessagingSettingsPage`, near the other `useState`/hook declarations, add:

```tsx
  const [correctionFormOpen, setCorrectionFormOpen] = useState(false)
  const [editCorrection, setEditCorrection] = useState<AiCorrection | null>(null)
  const { data: corrections = [], isLoading: loadingCorrections } = useAiCorrections()
  const approveCorrection = useApproveAiCorrection()
  const promoteCorrection = usePromoteAiCorrection()
  const deleteCorrection = useDeleteAiCorrection()
  const updateCorrection = useUpdateAiCorrection()

  function handleApproveCorrection(c: AiCorrection) {
    approveCorrection.mutate(c.id, {
      onSuccess: () => toast.success('Correction approved & added to AI memory'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }
  function handleRejectCorrection(c: AiCorrection) {
    updateCorrection.mutate({ id: c.id, updates: { status: 'REJECTED' } }, {
      onSuccess: () => toast.success('Correction rejected'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }
  function handlePromoteCorrection(c: AiCorrection) {
    promoteCorrection.mutate(c, {
      onSuccess: () => toast.success('Promoted to a permanent Knowledge Base rule'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }
  function handleDeleteCorrection(c: AiCorrection) {
    deleteCorrection.mutate(c.id, {
      onSuccess: () => toast.success('Correction deleted'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }
```

- [ ] **Step 4: Add the add/edit dialog component.** Define `CorrectionFormDialog` in the same file (mirroring `KbEntryFormDialog`'s plain-`useState` pattern), and render it near the other dialogs:

```tsx
function CorrectionFormDialog({
  open, onOpenChange, correction,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  correction?: AiCorrection | null
}) {
  const [customerMessage, setCustomerMessage] = useState(correction?.customer_message ?? '')
  const [correctReply, setCorrectReply] = useState(correction?.correct_reply ?? '')
  const [note, setNote] = useState(correction?.note ?? '')
  const createCorrection = useCreateAiCorrection()
  const updateCorrection = useUpdateAiCorrection()

  const isEdit = !!correction
  if (isEdit && customerMessage !== correction.customer_message && !createCorrection.isPending && !updateCorrection.isPending) {
    setCustomerMessage(correction.customer_message)
    setCorrectReply(correction.correct_reply)
    setNote(correction.note ?? '')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerMessage.trim() || !correctReply.trim()) return
    if (isEdit) {
      updateCorrection.mutate(
        { id: correction.id, updates: { customer_message: customerMessage.trim(), correct_reply: correctReply.trim(), note: note.trim() || null } },
        { onSuccess: () => { toast.success('Correction updated'); onOpenChange(false) }, onError: (err) => toast.error(`Failed: ${err.message}`) },
      )
    } else {
      createCorrection.mutate(
        { customer_message: customerMessage.trim(), correct_reply: correctReply.trim(), note: note.trim() || null, status: 'PENDING' },
        { onSuccess: () => { toast.success('Correction added'); setCustomerMessage(''); setCorrectReply(''); setNote(''); onOpenChange(false) }, onError: (err) => toast.error(`Failed: ${err.message}`) },
      )
    }
  }

  const isPending = createCorrection.isPending || updateCorrection.isPending
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'New'} Correction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Customer question</Label>
            <Textarea value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} className="min-h-[60px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Correct reply</Label>
            <Textarea value={correctReply} onChange={(e) => setCorrectReply(e.target.value)} className="min-h-[100px] text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Why (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[50px] text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !customerMessage.trim() || !correctReply.trim()}>{isEdit ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```
Render it alongside the KB dialog near the bottom of the page JSX:
```tsx
      <CorrectionFormDialog open={correctionFormOpen} onOpenChange={setCorrectionFormOpen} correction={editCorrection} />
```
Note: a correction added/edited here starts `PENDING`; it only enters memory when Approved (which embeds it). Editing an already-APPROVED correction does not re-embed — if the customer_message text changed, re-approve it to regenerate the embedding (acceptable for v1).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/messaging-settings.tsx
git commit -m "feat(messaging): AI Training card (review/approve/promote corrections)"
```

---

## Task B.7: End-to-end verification

- [ ] **Step 1: Full loop.** Run the app. In a conversation, click **Correct** on an AI draft, save. In Messaging Settings → **AI Training**, the row shows `PENDING`. Click **Approve**. Verify the embedding was written:
```sql
SELECT status, embedding IS NOT NULL AS has_embedding FROM ai_corrections ORDER BY created_at DESC LIMIT 1;
```
Expected: `status = APPROVED`, `has_embedding = true`. (If `has_embedding = false`, `Supabase.ai` is unavailable in the runtime — see backend plan Task 3.1 Step 2.)

- [ ] **Step 2: Retrieval works.** In "Test the AI", send a paraphrase of the corrected question. Confirm the draft follows the corrected guidance. (Optionally verify directly: embed the paraphrase and call `match_ai_corrections` — but the Test harness is the user-facing proof.)

- [ ] **Step 3: Promotion.** Approve → **Promote** a correction. Confirm a new Knowledge Base article appears (Messaging Settings → Knowledge Base) tagged to the specialist, and the correction shows `PROMOTED`:
```sql
SELECT c.status, c.promoted_knowledge_id, k.title FROM ai_corrections c JOIN knowledge_base k ON k.id = c.promoted_knowledge_id ORDER BY c.updated_at DESC LIMIT 1;
```

- [ ] **Step 4: Version bump + deploy.** Per project conventions, bump `package.json` (semver) once for this session's work and ship via the `push-to-main` skill (which commits + pushes; Vercel auto-deploys the frontend; edge functions were already deployed via CLI).

---

## Self-review notes

- **Spec coverage:** "Correct this" button → Task B.5. Training page (review/approve/reject/promote/add) → Task B.6. Approve→embed → Tasks B.1/B.2. Promote→Knowledge Base → Task B.2/B.6. No silent auto-capture — the only capture path is the deliberate button/dialog and manual add.
- **Convention fidelity:** service CRUD mirrors `knowledge_base` functions; hooks mirror KB hooks and invalidate `messaging.corrections()`; forms use plain `useState` like `KbEntryFormDialog` (not RHF+Zod), matching this file. The one pure helper has a `node:assert` test (the repo's only frontend test style).
- **Type consistency:** `AiCorrection`/`AiCorrectionInsert`/`AiCorrectionUpdate` defined once in `types.ts`; hooks named `useAiCorrections`/`useCreateAiCorrection`/`useUpdateAiCorrection`/`useDeleteAiCorrection`/`useApproveAiCorrection`/`usePromoteAiCorrection`; service functions `getAiCorrections`/`createAiCorrection`/`updateAiCorrection`/`deleteAiCorrection`/`approveAiCorrection`/`promoteAiCorrection`.
- **Confirm during execution:** the messages-array variable name in `messages.tsx`; the inbound-customer role literal (`'customer'` vs `'user'`); whether to store the specialist slug vs intent in the correction's `specialist_slug` (v1 stores the intent from `ai_context_summary`, acceptable since `match_ai_corrections` scoping is a soft filter with unscoped fallback).
```
