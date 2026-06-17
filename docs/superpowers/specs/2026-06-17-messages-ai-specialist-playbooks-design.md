# Messages AI — Specialist Playbooks (Plan 3b) — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design) — pending implementation plan
**Owner:** Joey (Dealz K.K.)
**Parent spec:** `docs/superpowers/specs/2026-06-16-messages-ai-agent-redesign-design.md` (§5.3, second half)
**Predecessor:** Plan 3 — intent routing (`docs/superpowers/specs/2026-06-17-messages-ai-intent-routing-design.md`)

---

## 1. Problem

The messaging AI today builds **one** system prompt for every draft: the active guardrails, a
single shared persona (`messaging_persona`), and **all** active `knowledge_base` entries
(`generate-draft.ts` lines 40–68). A product inquiry, an order-tracking question, a complaint, and a
kaitori offer are all answered by the same undifferentiated prompt.

Two problems follow:

1. **Replies aren't sharp per topic.** There's no per-topic playbook telling the model how to handle
   a complaint (apologize, never promise resolution, escalate) differently from a product inquiry
   (run the qualifying flow, recommend matches).
2. **Escalation is coarse.** Only `kaitori` and `complaint` always escalate, via a hardcoded set in
   `intent-routing.ts`. There's no per-topic, owner-editable control over which topics must always go
   to a human.

This is the **specialist-playbook** half of master-spec §5.3. (Plan 3 already shipped the **router**
half: every draft emits an `intent`, which is persisted to `conversations.ai_intent` and used to
triage the conversation into a folder.)

## 2. Goals & non-goals

**Goals (what Joey asked for):**

- **G1 — Sharper per-topic replies.** Each topic gets its own playbook (depth, tone, flow).
- **G2 — Tighter escalation control.** Per-topic, DB-editable rule for what must always escalate.

**Explicit non-goals (deprioritized by Joey; YAGNI):**

- Prompt-size / cost reduction via true KB slicing. The KB is ~11 short entries; slicing buys
  almost nothing today.
- Topic-shift re-routing between non-Inbox folders. Plan 3's triage-out-of-Inbox-**only** rule stays.
- A separate classifier model call. The LOCKED Plan-3 decision (no extra model call) is preserved.
- A new `technical` intent / Technical specialist. Technical questions fall under Sales/Generalist.
- Auto-send autonomy wiring. That belongs to a later plan (master-spec §6).

## 3. Decision: Approach A — single call, model self-selects

The intent is currently an **output** of the draft call, so a true "load only this specialist"
design would need the intent **before** the call — i.e. a second/classifier call (rejected) or a
stale previous-turn intent (weak, since most Dealz conversations are one turn).

**Instead, keep exactly one model call.** The system prompt gains a "Specialist Playbooks" section
containing every active specialist's playbook with its tagged KB grouped beneath it. The model
classifies the intent (as it already does) and is instructed to follow only the matching playbook.
After the call, escalation is enforced **in code** from the matched specialist's `always_escalate`
flag — deterministic, not dependent on the model.

- **Pros:** zero new model calls (respects the LOCKED decision); no chicken-and-egg; sharp on turn 1
  (critical for short conversations); escalation enforced deterministically.
- **Cons:** the prompt isn't smaller — acceptable, since focus/cost is a non-goal and the KB is tiny.

The KB tags added now make a future flip to a two-pass slicing design trivial if the KB ever grows
large enough to justify it.

## 4. Specialist roster

Five specialists mapped onto the **existing** emitted intents — no change to the AI output contract.

| Slug | Name | Owns intents | `always_escalate` |
|---|---|---|---|
| `sales` | Sales | `product_inquiry` | false |
| `order_tracking` | Order & Tracking | `tracking`, `order_status` | false |
| `aftersales` | Aftersales | `return`, `complaint` | **true** |
| `kaitori` | Kaitori | `kaitori` | **true** |
| `generalist` | Generalist | `general`, `unknown` | false |

This preserves today's escalation behavior for `kaitori` and `complaint`, and **adds `return`** to the
always-escalate set (returns are money/policy decisions; Aftersales is biased to escalate per §5.3).

## 5. Data model

### 5.1 New table `messaging_specialists`

```sql
CREATE TABLE messaging_specialists (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  intents            text[] NOT NULL DEFAULT '{}',
  playbook           text NOT NULL DEFAULT '',
  always_escalate    boolean NOT NULL DEFAULT false,
  auto_send_eligible boolean NOT NULL DEFAULT false,  -- reserved for Phase 2/3 autonomy; unused now
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
```

- RLS: staff full access (`auth.role() = 'authenticated'`), mirroring `knowledge_base`.
- Data API grants inherited via the `ALTER DEFAULT PRIVILEGES` migration; explicit `GRANT` added
  for safety per CLAUDE.md's post-Oct-2026 note.
- An intent maps to **at most one** active specialist. The seed guarantees disjoint `intents[]`
  arrays; if two active specialists ever claim the same intent, the resolver picks the one with the
  lowest `sort_order` (deterministic tie-break). If an intent is unmatched (or its specialist is
  inactive), it falls back to the Generalist; if no Generalist exists, the prompt omits the playbook
  section and behaves like today (graceful degradation).

### 5.2 KB tagging — `knowledge_base.specialist_tags`

```sql
ALTER TABLE knowledge_base ADD COLUMN specialist_tags text[] NOT NULL DEFAULT '{}';
```

- Values are specialist **slugs**. Empty/`{}` = **shared** → rendered in the General Knowledge
  section, visible to every specialist.
- An article may be tagged for multiple specialists (e.g. `Condition Grades` → `{sales,aftersales}`).
- All existing entries default to `{}` (shared), so nothing regresses until deliberately tagged.
- Array column chosen over a join table to match the codebase's lightweight style and because the
  relationship is small and read-only-at-prompt-time.

## 6. Prompt assembly

New pure module `supabase/functions/_shared/build-specialist-prompt.ts`. It replaces the current
prompt-building block in **both** callers, which today duplicate the same logic:
`generate-draft.ts` (lines 40–68) and `test-ai-reply/index.ts` (lines 80–95). Centralizing it is DRY
and makes the AI Test Playground a genuine test of the specialist prompt. Inputs: guardrail entries,
persona system prompt, knowledge entries (each with `specialist_tags`), and active specialists.
Output: the `fullSystemPrompt` string.

Structure:

```
# Rules (NEVER violate)
1. **<guardrail title>**: <content>          ← always all guardrails

<base persona — messaging_persona.system_prompt>

# Specialist Playbooks
Identify which specialist the customer's message fits, then follow ONLY that playbook.

## <Specialist name> — <comma-joined intents, human readable>
<playbook>
Relevant knowledge:
## <KB title>
<KB content>                                 ← KB whose specialist_tags include this slug

## <next specialist> ...

# General Knowledge
## <KB title>
<KB content>                                 ← KB with empty specialist_tags (shared)
```

Composition is unchanged downstream: this string is passed to `generateAIReply`, which still calls
`buildEnhancedPrompt` to append the global code-constant rules (`INVENTORY_RESPONSE_RULE`,
`CLARIFY_BEFORE_ASSUMING_RULE`), then the provider function appends the customer-context block and the
JSON output contract. Specialist playbooks are additive and do not duplicate the global rules.

Edge cases handled by the helper:
- No active specialists → omit the Specialist Playbooks section (today's behavior).
- A specialist with no tagged KB → render the playbook with no "Relevant knowledge" sub-block.
- Inactive specialists and inactive KB entries are excluded.

## 7. Escalation enforcement

Replace the hardcoded `ESCALATING_INTENTS` set / `isEscalatingIntent` in
`supabase/functions/_shared/intent-routing.ts` with a lookup driven by the loaded specialists:

- A small pure resolver maps an emitted `intent` to its owning specialist (from the `intents[]`
  arrays). `generate-draft.ts` already loads specialists for the prompt, so it reuses that list.
- After the draft call, `needsReview` becomes:
  `confidence < 0.5 || escalation_reason !== null || matchedSpecialist?.always_escalate === true`.
- Behavior is enforced in code regardless of the model's output. The playbook text is advisory; the
  `always_escalate` flag is authoritative.
- Existing callers/tests of `isEscalatingIntent` are updated to the resolver form.

## 8. Admin UI

In `src/pages/admin/messaging-settings.tsx`:

- **New "Specialists" section** listing the 5 rows. Each row: name (read-only/label), editable
  `playbook` textarea, `always_escalate` toggle, `is_active` toggle. (Roster is fixed; this is edit,
  not full CRUD — no add/delete of specialists in the UI for now.)
- **KB editor addition:** a specialist-tags multi-select beside the existing category field, writing
  `knowledge_base.specialist_tags`.

New service functions in `src/services/messaging.ts` (`listSpecialists`, `updateSpecialist`, and KB
tag write). TypeScript types regenerated after the migration. Follows existing TanStack Query +
toast + RHF/Zod conventions.

## 9. Migration + seed

One migration (`supabase/migrations/<ts>_specialist_playbooks.sql`):

1. `CREATE TABLE messaging_specialists` (+ RLS, grants, index on `is_active, sort_order`).
2. `ALTER TABLE knowledge_base ADD COLUMN specialist_tags`.
3. Seed the 5 specialists with starter playbooks distilled from existing KB/guardrails (e.g. Sales
   playbook from the "Handling Product Inquiries" article; Aftersales from the return/complaint
   guardrails).
4. Tag existing KB entries (e.g. Shipping/Payments → `order_tracking`; Condition Grades →
   `sales,aftersales`; Kaitori Process → `kaitori`; Product Inquiries → `sales`; Tagalog guide →
   shared).

Applied via `supabase db push` (no local DB), per project convention.

## 10. Testing

- Deno unit tests for `build-specialist-prompt.ts`: correct per-specialist grouping, shared-fallback
  for untagged KB, exclusion of inactive specialists/KB, and the no-specialists degradation path.
- Deno unit tests for the intent→specialist resolver and the `always_escalate` derivation (mirrors
  `intent-routing.test.ts`).
- Manual verification in the AI Test Playground (Admin → Messaging Settings): confirm a complaint
  triggers escalation, a product inquiry runs the Sales flow, and an unknown message uses the
  Generalist.

## 11. Key files & tables (reference)

- Edge: `_shared/generate-draft.ts` (prompt block + escalation), `test-ai-reply/index.ts` (prompt
  block → shared helper), `_shared/intent-routing.ts` (resolver replaces hardcoded set), **new**
  `_shared/build-specialist-prompt.ts`, `_shared/ai-providers.ts` (unchanged composition),
  `generate-pending-drafts` (deploy target).
- UI: `src/pages/admin/messaging-settings.tsx`, `src/services/messaging.ts`, `src/lib/types.ts`.
- Tables: **new** `messaging_specialists`; `knowledge_base` (+`specialist_tags`); reads
  `messaging_persona`. Unchanged: `conversations` (`ai_intent`, `folder_id`), `messages`,
  `ai_usage_log`.

## 12. Deployment

Branch off `main`. After merge: `supabase db push`, regenerate types, then
`supabase functions deploy generate-pending-drafts test-ai-reply` (the cron caller of
`generateAndSaveDraft` plus the Playground, both now using the shared prompt helper), then push
`main`.
