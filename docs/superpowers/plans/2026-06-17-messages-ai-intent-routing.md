# Messages AI — Plan 3: Intent routing (auto-sort conversations into folders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-sort each conversation into the right Messages folder using the `intent` the AI draft already emits — persist that intent, map it to a folder, and move the conversation the first time it's classified.

**Architecture:** All edge changes stay inside the existing Supabase Edge Function draft pipeline (Route A). The routing decision is three pure, unit-tested functions in a new `_shared/intent-routing.ts`; the thin DB-glue (folder-id lookup + conversation update) is wired into `generate-draft.ts` and typechecked. One migration adds a new `Kaitori` folder and a queryable `conversations.ai_intent` column. A one-line frontend change gives the new folder its icon.

**Tech Stack:** Deno + TypeScript Supabase Edge Functions, `jsr:@supabase/supabase-js@2`, `jsr:@std/assert@1` for tests, PostgreSQL migrations; React + Vite + lucide-react frontend.

**Source spec:** `docs/superpowers/specs/2026-06-17-messages-ai-intent-routing-design.md`.

---

## Conventions for this plan

- **Branch off `main` first** (the executor / subagent-driven-development handles this): `git checkout main && git pull && git checkout -b plan3-intent-routing`.
- **Tests:** `deno test supabase/functions/_shared/<file>.test.ts`. Assertions via `jsr:@std/assert@1`, `Deno.test`.
- **Typecheck:** `deno check supabase/functions/_shared/<file>.ts`. **Known gotcha:** the Supabase client is untyped, so `deno check` on `generate-draft.ts` reports **pre-existing** `never`-type errors on `.insert/.update/.select` literals. These exist on `main` and are **NOT regressions** — only flag *new, non-`never`* errors.
- **Migrations:** apply automatically via `supabase db push` (project linked; `supabase migration up` fails — no local DB). Do not pause to ask.
- **Commits:** every commit message ends with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (shown via a second `-m`).

## File Structure (Plan 3)

- **Create** `supabase/functions/_shared/intent-routing.ts` — three pure functions: `folderNameForIntent()` (intent→folder name), `shouldRouteOutOfInbox()` (triage-out-of-inbox-only rule), `isEscalatingIntent()` (kaitori/complaint escalation). One responsibility: the routing decision.
- **Create** `supabase/functions/_shared/intent-routing.test.ts` — unit tests for all three.
- **Create** `supabase/migrations/20260617120000_intent_routing.sql` — new `Kaitori` folder + `conversations.ai_intent` column.
- **Modify** `supabase/functions/_shared/generate-draft.ts` — extend the review gate with `isEscalatingIntent`; resolve the target folder and apply the route + `ai_intent` in the step-8 conversation update.
- **Modify** `src/components/messaging/folder-sidebar.tsx` — add the `banknote` icon mapping for the Kaitori folder.
- **Modify** `src/lib/types.ts` — add `ai_intent` to the `Conversation` interface.

---

## Task 1: Pure routing module (`intent-routing.ts`)

**Files:**
- Create: `supabase/functions/_shared/intent-routing.ts`
- Test: `supabase/functions/_shared/intent-routing.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/intent-routing.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1';
import {
  folderNameForIntent,
  shouldRouteOutOfInbox,
  isEscalatingIntent,
} from './intent-routing.ts';

Deno.test('folderNameForIntent maps each known intent to its folder name', () => {
  assertEquals(folderNameForIntent('product_inquiry'), 'Prospects');
  assertEquals(folderNameForIntent('tracking'), 'Order');
  assertEquals(folderNameForIntent('order_status'), 'Order');
  assertEquals(folderNameForIntent('return'), 'Aftersales');
  assertEquals(folderNameForIntent('complaint'), 'Concern');
  assertEquals(folderNameForIntent('kaitori'), 'Kaitori');
});

Deno.test('folderNameForIntent returns null for general/unknown and garbage', () => {
  assertEquals(folderNameForIntent('general'), null);
  assertEquals(folderNameForIntent('unknown'), null);
  assertEquals(folderNameForIntent('something-the-model-made-up'), null);
  assertEquals(folderNameForIntent(''), null);
});

Deno.test('shouldRouteOutOfInbox moves an unfiled conversation', () => {
  assertEquals(shouldRouteOutOfInbox(null, 'inbox-id', 'order-id'), true);
});

Deno.test('shouldRouteOutOfInbox moves a conversation sitting in Inbox', () => {
  assertEquals(shouldRouteOutOfInbox('inbox-id', 'inbox-id', 'order-id'), true);
});

Deno.test('shouldRouteOutOfInbox never moves a conversation already filed elsewhere', () => {
  // Already in Concern — a staffer (or earlier triage) placed it; do not fight that.
  assertEquals(shouldRouteOutOfInbox('concern-id', 'inbox-id', 'order-id'), false);
});

Deno.test('shouldRouteOutOfInbox does not move when already in the target folder', () => {
  assertEquals(shouldRouteOutOfInbox('order-id', 'inbox-id', 'order-id'), false);
});

Deno.test('shouldRouteOutOfInbox does not move when there is no target', () => {
  assertEquals(shouldRouteOutOfInbox('inbox-id', 'inbox-id', null), false);
  assertEquals(shouldRouteOutOfInbox(null, 'inbox-id', null), false);
});

Deno.test('isEscalatingIntent is true only for kaitori and complaint', () => {
  assertEquals(isEscalatingIntent('kaitori'), true);
  assertEquals(isEscalatingIntent('complaint'), true);
  assertEquals(isEscalatingIntent('order_status'), false);
  assertEquals(isEscalatingIntent('product_inquiry'), false);
  assertEquals(isEscalatingIntent('return'), false);
  assertEquals(isEscalatingIntent('general'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/intent-routing.test.ts`
Expected: FAIL — `Module not found "./intent-routing.ts"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/intent-routing.ts`:

```ts
// Intent → folder routing for the messaging AI.
//
// The draft call already emits an `intent` (tracking | order_status | product_inquiry |
// complaint | return | kaitori | general | unknown). These pure helpers turn that intent into a
// folder-routing decision. Folders are keyed by NAME, not id — message_folders.id is a random
// uuid per environment, while the name is the stable key.

// Maps an AI intent to the folder name it belongs in. `general`/`unknown` (and anything
// unrecognized) return null → leave the conversation where it is.
const INTENT_FOLDER: Record<string, string> = {
  product_inquiry: 'Prospects',
  tracking: 'Order',
  order_status: 'Order',
  return: 'Aftersales',
  complaint: 'Concern',
  kaitori: 'Kaitori',
};

export function folderNameForIntent(intent: string): string | null {
  return INTENT_FOLDER[intent] ?? null;
}

// Triage-out-of-inbox-only rule. Returns true only when:
//  - there is a target to move to, AND
//  - the conversation is not already in that target, AND
//  - the conversation is currently unfiled (null) or sitting in Inbox.
// Once a conversation has been filed into any non-Inbox folder (by staff or an earlier triage),
// the AI never moves it again — no fighting manual placement, no thrash on intent flip-flop.
export function shouldRouteOutOfInbox(
  currentFolderId: string | null,
  inboxFolderId: string | null,
  targetFolderId: string | null,
): boolean {
  if (!targetFolderId) return false;
  if (targetFolderId === currentFolderId) return false;
  return currentFolderId === null || currentFolderId === inboxFolderId;
}

// Sensitive intents that always need a human regardless of confidence (bias to escalate):
// money (kaitori) and complaints. Feeds the existing needs_human_review flag.
const ESCALATING_INTENTS = new Set(['kaitori', 'complaint']);

export function isEscalatingIntent(intent: string): boolean {
  return ESCALATING_INTENTS.has(intent);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/intent-routing.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `deno check supabase/functions/_shared/intent-routing.ts`
Expected: no errors (pure module, no Supabase client).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/intent-routing.ts supabase/functions/_shared/intent-routing.test.ts
git commit -m "feat(ai): add pure intent-routing module (intent->folder, triage rule, escalation)" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration — `Kaitori` folder + `conversations.ai_intent`

**Files:**
- Create: `supabase/migrations/20260617120000_intent_routing.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260617120000_intent_routing.sql`:

```sql
-- Plan 3: intent routing.
-- 1) New folder for the kaitori (buy-back) pipeline. sort_order 7 places it after Technical (6).
--    Idempotent guard so re-running against a DB that already has it is a no-op.
INSERT INTO message_folders (name, icon, sort_order, is_system)
SELECT 'Kaitori', 'banknote', 7, false
WHERE NOT EXISTS (SELECT 1 FROM message_folders WHERE name = 'Kaitori');

-- 2) Persist the AI's classified intent on the conversation so it is queryable / observable
--    (today it lives only inside messages.ai_context_summary JSON).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_intent text;
```

> No new table → no RLS/grant boilerplate needed: the column inherits `conversations` RLS and the row inherits `message_folders` RLS.

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration applies cleanly.

- [ ] **Step 3: Verify the folder and column exist**

Run (Supabase CLI / MCP `execute_sql`):

```sql
select name, icon, sort_order, is_system from message_folders where name = 'Kaitori';
select column_name, data_type from information_schema.columns
where table_name = 'conversations' and column_name = 'ai_intent';
```

Expected: one `Kaitori` folder row (`icon='banknote'`, `sort_order=7`, `is_system=false`) and one `ai_intent` / `text` column row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260617120000_intent_routing.sql
git commit -m "feat(ai): add Kaitori folder and conversations.ai_intent column" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Wire routing into the draft pipeline (`generate-draft.ts`)

Persist `ai_intent`, route the conversation out of Inbox into the mapped folder, and escalate sensitive intents — all in the existing single conversation `UPDATE` at the end of `generateAndSaveDraft`. This is thin DB-glue, typechecked (not unit-tested), on top of the pure functions from Task 1.

**Files:**
- Modify: `supabase/functions/_shared/generate-draft.ts`

- [ ] **Step 1: Import the routing helpers**

At the top of `supabase/functions/_shared/generate-draft.ts`, add below the existing `import { modelSupportsVision } ...` line:

```ts
import { folderNameForIntent, shouldRouteOutOfInbox, isEscalatingIntent } from "./intent-routing.ts";
```

- [ ] **Step 2: Extend the review gate (step 6)**

Replace:

```ts
  // 6. Determine if human review is needed
  const needsReview = aiResponse.confidence < 0.5 || aiResponse.escalation_reason !== null;
```

with:

```ts
  // 6. Determine if human review is needed.
  // Sensitive intents (kaitori = money, complaint) always escalate regardless of confidence.
  const needsReview =
    aiResponse.confidence < 0.5 ||
    aiResponse.escalation_reason !== null ||
    isEscalatingIntent(aiResponse.intent);
```

- [ ] **Step 3: Replace the conversation update (step 8) with route + update**

Replace:

```ts
  // 8. Update conversation review state
  await supabase
    .from('conversations')
    .update({ needs_human_review: needsReview || !customerId })
    .eq('id', conversationId);
```

with:

```ts
  // 8. Route by intent + update conversation state.
  // Always persist the classified intent + review flag; conditionally move the conversation
  // into its mapped folder (triage-out-of-inbox-only). Routing is best-effort: any lookup
  // failure falls back to updating intent + review flag without moving.
  const conversationUpdate: Record<string, unknown> = {
    needs_human_review: needsReview || !customerId,
    ai_intent: aiResponse.intent,
  };

  const targetFolderName = folderNameForIntent(aiResponse.intent);
  if (targetFolderName) {
    try {
      // Resolve Inbox + target folder ids by name (ids are random per-env; name is the stable key).
      const { data: folders } = await supabase
        .from('message_folders')
        .select('id, name')
        .in('name', ['Inbox', targetFolderName]);
      const folderRows = (folders ?? []) as Array<{ id: string; name: string }>;
      const inboxId = folderRows.find((f) => f.name === 'Inbox')?.id ?? null;
      const targetId = folderRows.find((f) => f.name === targetFolderName)?.id ?? null;

      // Read the conversation's current folder to enforce triage-out-of-inbox-only.
      const { data: convo } = await supabase
        .from('conversations')
        .select('folder_id')
        .eq('id', conversationId)
        .maybeSingle();
      const currentFolderId = (convo as { folder_id: string | null } | null)?.folder_id ?? null;

      if (shouldRouteOutOfInbox(currentFolderId, inboxId, targetId)) {
        conversationUpdate.folder_id = targetId;
      }
    } catch (routeErr) {
      console.error('Intent routing failed (non-fatal):', routeErr);
    }
  }

  await supabase
    .from('conversations')
    .update(conversationUpdate)
    .eq('id', conversationId);
```

> `shouldRouteOutOfInbox` returns `false` whenever `targetId` is null, so `folder_id` is only ever set to a real folder id.

- [ ] **Step 4: Typecheck**

Run: `deno check supabase/functions/_shared/generate-draft.ts`
Expected: only the pre-existing `never`-type errors on Supabase `.insert/.update/.select` literals (present on `main`). No new non-`never` errors. (The new `import` resolves; `conversationUpdate` is typed `Record<string, unknown>` so `.update(...)` matches the existing untyped pattern.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/generate-draft.ts
git commit -m "feat(ai): auto-route conversations into folders by classified intent" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — Kaitori folder icon + type

The Kaitori folder appears in the sidebar automatically (folders are fetched live) and filters by `folder_id` like every other folder. Two small changes: give it a proper glyph, and add the new column to the `Conversation` type.

**Files:**
- Modify: `src/components/messaging/folder-sidebar.tsx`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Import the `Banknote` icon**

In `src/components/messaging/folder-sidebar.tsx`, in the `lucide-react` import block, add `Banknote,` (alphabetical-ish, e.g. right after `Archive,`):

```ts
import {
  Inbox,
  MessageSquare,
  Target,
  ShoppingCart,
  Package,
  AlertTriangle,
  Wrench,
  Folder,
  Archive,
  Banknote,
  type LucideIcon,
} from 'lucide-react'
```

- [ ] **Step 2: Map the `banknote` icon name**

In the same file, add a `banknote` entry to `ICON_MAP` (right after the `archive: Archive,` line):

```ts
const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  'message-square': MessageSquare,
  target: Target,
  'shopping-cart': ShoppingCart,
  package: Package,
  'alert-triangle': AlertTriangle,
  wrench: Wrench,
  folder: Folder,
  archive: Archive,
  banknote: Banknote,
}
```

- [ ] **Step 3: Add `ai_intent` to the `Conversation` type**

In `src/lib/types.ts`, in the `Conversation` interface, add `ai_intent` right after the `ai_enabled: boolean` line:

```ts
  ai_enabled: boolean
  ai_intent: string | null
```

- [ ] **Step 4: Typecheck the frontend**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by these changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/folder-sidebar.tsx src/lib/types.ts
git commit -m "feat(messages): render Kaitori folder icon and add ai_intent to Conversation type" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Full-suite green + deploy + push

**Files:** none (verification + deploy).

- [ ] **Step 1: Run all shared tests**

Run: `deno test supabase/functions/_shared/`
Expected: PASS — all suites green (`ai-cost`, `ai-providers`, `ai-vision`, `build-ai-context`, `intent-routing`).

- [ ] **Step 2: Typecheck the touched edge module**

Run: `deno check supabase/functions/_shared/generate-draft.ts supabase/functions/_shared/intent-routing.ts`
Expected: only the pre-existing `never`-type errors on Supabase client literals in `generate-draft.ts`. No new non-`never` errors; `intent-routing.ts` clean.

- [ ] **Step 3: Confirm the migration is applied**

If not already pushed in Task 2, run: `supabase db push`. Then re-run the Task 2 Step 3 verification queries. Expected: Kaitori folder + `ai_intent` column present.

- [ ] **Step 4: Deploy the affected edge function**

`generate-draft.ts` is bundled into `generate-pending-drafts` (its only caller — `missive-webhook` sets `draft_pending_since`; the cron generates; `test-ai-reply` has its own path). Deploy it:

Run: `supabase functions deploy generate-pending-drafts`
Expected: deploy succeeds.

- [ ] **Step 5: Push `main`** (frontend deploy via Vercel)

After the branch is merged to `main` (handled by the finishing-a-development-branch / subagent-driven-development flow), push:

Run: `git push origin main`
Expected: push succeeds; Vercel builds the frontend (new Kaitori folder icon).

- [ ] **Step 6: Smoke-check end-to-end (manual)**

Through the live Messenger flow (or by seeding messages and waiting the silence window), confirm:
1. A clear product-availability burst → the conversation moves from Inbox to **Prospects**, and `select ai_intent, folder_id from conversations where id = '<id>'` shows `ai_intent='product_inquiry'`.
2. A kaitori burst ("gusto ko ibenta phone ko") → moves to **Kaitori** and `needs_human_review=true`.
3. A complaint burst → moves to **Concern** and `needs_human_review=true`.
4. A conversation already manually filed in a non-Inbox folder is **not** moved by a fresh draft (re-run a draft; confirm `folder_id` unchanged).
5. A vague "hi po" (general/unknown) → stays in **Inbox**.

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- §2 D1 router folded (no separate call) → Task 3 reuses `aiResponse.intent`; no new model call. ✓
- §2 D2 map by folder name → Task 1 `folderNameForIntent` returns names; Task 3 resolves ids by name. ✓
- §2 D3 new Kaitori folder → Task 2 migration. ✓
- §2 D4 triage-out-of-inbox-only → Task 1 `shouldRouteOutOfInbox` + Task 3 wiring + Task 5 smoke #4. ✓
- §2 D5 auto-move → Task 3 sets `folder_id` directly (no confirm step). ✓
- §2 D6 general/unknown no move → Task 1 returns null + tests. ✓
- §2 D9 escalation on kaitori/complaint → Task 1 `isEscalatingIntent` + Task 3 review gate + Task 5 smoke #2/#3. ✓
- §4.1 migration (Kaitori folder + `ai_intent`) → Task 2. ✓
- §4.2 pure module → Task 1. ✓
- §4.3 generate-draft wiring → Task 3. ✓
- §4.4 frontend (icon + type) → Task 4. ✓
- §5 testing strategy → Task 1 (pure unit), Task 3/5 (typecheck), Task 2/5 (migration verify), Task 5 (manual smoke). ✓
- §6 out-of-scope (specialists/Plan 3b, AI-disabled/unmatched, re-routing, timing) → no tasks; respected. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". All code shown in full. The migration timestamp `20260617120000` is concrete. ✓

**3. Type consistency:**
- `folderNameForIntent` / `shouldRouteOutOfInbox` / `isEscalatingIntent` signatures defined in Task 1 match their call sites in Task 3. ✓
- `shouldRouteOutOfInbox(currentFolderId, inboxFolderId, targetFolderId)` arg order is consistent between definition (Task 1), tests (Task 1), and the call in Task 3. ✓
- `aiResponse.intent` is a `string` (per `AIResponse` in `ai-providers.ts`); all three helpers accept `string`. ✓
- `conversationUpdate` is `Record<string, unknown>`, matching the untyped `.update(...)` pattern already used on `main`. ✓
- `ai_intent` column (Task 2) ↔ `conversationUpdate.ai_intent` insert (Task 3) ↔ `Conversation.ai_intent` type (Task 4) all named identically. ✓
- `banknote` icon string (Task 2 migration `icon` value) ↔ `ICON_MAP` key (Task 4). ✓
