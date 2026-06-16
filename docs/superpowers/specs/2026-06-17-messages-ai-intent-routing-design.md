# Plan 3 — Intent routing: auto-sort conversations into folders

**Date:** 2026-06-17
**Status:** Approved (design) — pending implementation plan
**Owner:** Joey (Dealz K.K.)
**Parent spec:** `docs/superpowers/specs/2026-06-16-messages-ai-agent-redesign-design.md` (§5.3, first half)
**Predecessors:** Plan 1 — Fast Wins (vision + cost telemetry), Plan 2 — context-complete / clarify-don't-guess. Both merged & deployed.

---

## 1. Problem

Spec §5.3 calls for a router + specialist playbooks. The immediate, highest-value slice is the
**router half**: reliably identify each incoming conversation's intent and auto-sort it into the right
Messages folder, so staff see Prospects / Order / Aftersales / Concern / Technical / Kaitori already
triaged instead of one undifferentiated Inbox.

Investigation reframed the work as **wiring, not a new brain**:

- Every draft the AI generates **already emits an `intent`** (`tracking | order_status |
  product_inquiry | complaint | return | kaitori | general | unknown`), produced by
  `parseAIResponse` and stored inside `messages.ai_context_summary` JSON
  (`generate-draft.ts:127–132`).
- That intent is **never persisted as a queryable field** and **never used to move a conversation**.
  Folder assignment is entirely manual today.

So routing = persist the already-produced intent + map it to a folder + move the conversation. No
second model call.

## 2. Decisions (locked during brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Router is folded into the existing draft call** — no separate classifier model call. | The draft call already returns `intent`. A second cheap-model call would re-read the same burst and pay another API round-trip for a signal we already have (spec §10 open item resolved). |
| D2 | **Intent→folder mapping is by folder `name`**, not id. | `message_folders.id` is a random uuid per environment; `name` is the stable key. There is no `slug` column. |
| D3 | **Create a new `Kaitori` folder.** | The live folder set (verified against the running DB) is Inbox / Prospects / Order / Aftersales / Concern / Technical — there is no Kaitori home for the `kaitori` intent. |
| D4 | **Triage out of Inbox only.** The AI moves a conversation the first time (Inbox or unfiled → mapped folder); once it sits in a non-Inbox folder the AI never moves it again. | Never fights a staffer's manual placement; no thrash on intent flip-flop. Topic-shift re-routing is deferred to Plan 3b specialist hand-off. |
| D5 | **Auto-move (no suggest-and-confirm).** | Folder is just triage and fully reversible by staff. |
| D6 | **`general` / `unknown` never trigger a move.** | Don't reorganize on a low-information guess; they stay in Inbox. |
| D7 | **Specialist playbooks + `knowledge_base` tagging are a separate sub-plan (Plan 3b).** | Routing is small, testable, and shippable alone. Specialists need their own design pass (tagging scheme, per-intent prompt slicing, personas). |

### Locked intent → folder mapping

| Intent | Folder | Notes |
|---|---|---|
| `product_inquiry` | Prospects | |
| `tracking` | Order | |
| `order_status` | Order | |
| `return` | Aftersales | |
| `complaint` | Concern | also sets `needs_human_review` (D9) |
| `kaitori` | **Kaitori** (new) | also sets `needs_human_review` (D9) |
| `general` | — | stay in Inbox |
| `unknown` | — | stay in Inbox |

### D8 — Routing executes only in the real cron path

`generateAndSaveDraft` (the only place a draft is persisted to a real conversation) is called **only**
by `generate-pending-drafts`. `test-ai-reply` (the AI Playground) has its own inline generation path
that never saves a draft and never touches `conversations`. Therefore routing lives inside
`generateAndSaveDraft` and the Playground is unaffected automatically — **no feature flag needed**.

### D9 — Escalation bias on sensitive intents

`kaitori` and `complaint` set `needs_human_review = true` regardless of confidence (bias to escalate).
This reuses the existing flag, surfaces them in Plan 4's HID inbox, and is the exact signal Plan 5
(autonomy phasing) needs to never auto-send money/complaint topics.

## 3. Scope

All edge changes stay inside the existing draft pipeline (Route A). One migration adds the Kaitori
folder and an `ai_intent` column. A one-line frontend change gives the new folder its icon.

## 4. Component designs

### 4.1 Data model — one migration

```sql
-- New folder for the kaitori (buy-back) pipeline. sort_order 7 places it after Technical (6).
INSERT INTO message_folders (name, icon, sort_order, is_system)
VALUES ('Kaitori', 'banknote', 7, false);

-- Persist the AI's classified intent on the conversation so it is queryable / observable
-- (today it is buried only inside messages.ai_context_summary JSON).
ALTER TABLE conversations ADD COLUMN ai_intent text;
```

No new table → no new RLS or grant boilerplate (the column inherits `conversations` RLS; the folder
row inherits `message_folders` RLS). Applied via `supabase db push`.

### 4.2 New pure module `_shared/intent-routing.ts` (the TDD core)

Three small pure functions, fully unit-tested with `Deno.test`:

```ts
// Map an AI intent to the folder NAME it belongs in, or null to leave the conversation put.
export function folderNameForIntent(intent: string): string | null

// Triage-out-of-inbox rule: move only when the conversation is currently unfiled (null) or in
// Inbox, AND the target differs from where it already is. Returns false once a conversation has
// been filed into any non-Inbox folder (never fights a manual placement, never thrashes).
export function shouldRouteOutOfInbox(
  currentFolderId: string | null,
  inboxFolderId: string | null,
  targetFolderId: string | null,
): boolean

// Sensitive intents that always need a human regardless of confidence (D9).
export function isEscalatingIntent(intent: string): boolean
```

`folderNameForIntent` encodes the §2 mapping table; `null` for `general`/`unknown` (and any
unrecognized value). `shouldRouteOutOfInbox` returns `false` if `targetFolderId` is null/equal to
current, or if current is a non-null, non-Inbox folder. `isEscalatingIntent` → true for
`kaitori`/`complaint`.

### 4.3 Wiring in `generate-draft.ts` (folded IO, typechecked)

Today steps 6–8 are: compute `needsReview` → insert DRAFT → `update({ needs_human_review })`. Plan 3
replaces step 6 and step 8:

- **Step 6 (review gate):**
  `needsReview = confidence < 0.5 || escalation_reason !== null || isEscalatingIntent(intent)`.
- **Step 8 (route + update, single conversation UPDATE):**
  1. `targetName = folderNameForIntent(intent)`.
  2. If `targetName` is non-null, resolve folder ids by name in one query
     (`select id, name from message_folders where name in ('Inbox', targetName)`), read the
     conversation's current `folder_id`, and compute `shouldRouteOutOfInbox(...)`.
  3. Build the update: always `{ needs_human_review: needsReview || !customerId, ai_intent: intent }`,
     plus `folder_id: targetId` when routing applies. Apply as one `.update(...)`.

Folder/conversation lookups are best-effort: if a folder name can't be resolved or a query fails, log
and fall back to updating only `needs_human_review` + `ai_intent` (never block the draft).

### 4.4 Frontend (minimal)

- `src/components/messaging/folder-sidebar.tsx`: add `banknote` to the icon-name → Lucide-component
  map so the Kaitori folder renders a proper glyph (otherwise it falls back to the generic folder
  icon). The folder appears in the sidebar automatically (folders are fetched live); clicking it
  filters conversations by `folder_id` exactly like every existing folder, and the
  `get_awaiting_reply_counts()` RPC already returns its badge count per `folder_id`.
- `src/lib/types.ts`: add `ai_intent: string | null` to the `conversations` row type.

## 5. Testing strategy

- **Pure (TDD, `Deno.test`):** `folderNameForIntent` over all eight intents (incl. null cases);
  `shouldRouteOutOfInbox` (null current → move; Inbox current → move; non-Inbox current → no move;
  target === current → no move; null target → no move); `isEscalatingIntent`
  (kaitori/complaint true, others false).
- **IO glue (typechecked, `deno check`):** the folder-id lookup + conversation update in
  `generate-draft.ts`. Per the project gotcha, pre-existing `never`-type errors on untyped Supabase
  `.select/.update` literals are **not** regressions — only new non-`never` errors are flagged.
- **Migration:** apply via `supabase db push`; verify the Kaitori folder exists and the `ai_intent`
  column is present.
- **Manual smoke:** send Messenger tests whose burst reads as each intent; after the silence window,
  confirm the conversation lands in the mapped folder, `conversations.ai_intent` is set, and a
  kaitori/complaint conversation is flagged `needs_human_review`. Confirm a conversation already filed
  in a non-Inbox folder is **not** moved by a new draft.

## 6. Out of scope (YAGNI / deferred)

- **Specialist playbooks + `knowledge_base` tagging + per-intent prompt slicing → Plan 3b.**
- Routing for AI-disabled or unmatched conversations (no draft is generated → nothing to classify;
  they remain in Inbox, already flagged for review).
- Topic-shift re-routing after a conversation is filed (Plan 3b specialist hand-off).
- Any change to the 120s debounce / cron timing, the send rail, or autonomy (Plans 4–5).

## 7. Files (reference)

- **Create** `supabase/migrations/20260617NNNNNN_intent_routing.sql` — Kaitori folder + `ai_intent`
  column.
- **Create** `supabase/functions/_shared/intent-routing.ts` — `folderNameForIntent`,
  `shouldRouteOutOfInbox`, `isEscalatingIntent` (pure).
- **Create** `supabase/functions/_shared/intent-routing.test.ts` — unit tests for the three pure
  functions.
- **Modify** `supabase/functions/_shared/generate-draft.ts` — extend the review gate with
  `isEscalatingIntent`; resolve the target folder and apply the route + `ai_intent` in the step-8
  conversation update.
- **Modify** `src/components/messaging/folder-sidebar.tsx` — add the `banknote` icon mapping.
- **Modify** `src/lib/types.ts` — add `ai_intent` to the `conversations` row type.
- **Deploy after merge:** `supabase functions deploy generate-pending-drafts` (it bundles the shared
  files). Push `main`.
