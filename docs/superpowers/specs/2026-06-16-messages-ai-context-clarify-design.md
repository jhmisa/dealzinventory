# Plan 2 — Context-complete, clarify-don't-guess drafts

**Date:** 2026-06-16
**Status:** Approved (design) — pending implementation plan
**Owner:** Joey (Dealz K.K.)
**Parent spec:** `docs/superpowers/specs/2026-06-16-messages-ai-agent-redesign-design.md` (§5.1)
**Predecessor:** Plan 1 — Fast Wins (vision + cost telemetry), merged to main.

---

## 1. Problem

The messaging AI "replies too fast and assumes too much." The parent spec framed the fix as
replacing the "flat 120s debounce" with a silence window + completion-signal early trigger + burst
bundling.

Investigation changed the shape of the fix:

- **The 120s debounce is already a trailing silence window.** `missive-webhook/index.ts:330`
  overwrites `conversations.draft_pending_since = now()` on *every* inbound customer message, and the
  cron (`generate_pending_drafts`, every 60s) only fires after `now - draft_pending_since >=
  debounce_seconds`. Each new message resets the clock → "wait 120s after the **last** customer
  message." The gate already exists.
- **The burst is already bundled at the model layer.** `consolidateMessages()` in `ai-providers.ts`
  merges consecutive same-role turns into one user turn.

So the real over-assuming is not a timing problem — it is a **context-fidelity + clarification**
problem. The model assumes because (a) it cannot always see the full, clean picture, and (b) nothing
tells it to resolve-from-context-then-ask instead of guessing.

## 2. Decisions (locked during brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **No completion-signal early trigger.** | User chose "no early trigger." Removes the webhook heuristic and any new column/window plumbing. |
| D2 | **Keep the silence window at 120s** (2 min), still tunable via `ai_draft_debounce_seconds`. | User chose "2 min," which equals today's default → no timing code changes. |
| D3 | **Fragment / bare-screenshot → intelligent, context-aware clarifying question.** | User: load full context (incl. our prior replies + the customer's orders), resolve vague references, ask one *specific* question, and never re-ask what was already answered. |
| D4 | **Clarify rules live in a code constant**, sibling to `INVENTORY_RESPONSE_RULE`. | Version-controlled, test-covered, consistent; tone/business wording stays in DB persona/guardrails. |

## 3. Scope

Plan 2 reduces to two themes: **context completeness** (so the model rarely *needs* to assume) and
**clarify-don't-guess** (so when it must, it asks one smart question instead of guessing). No timer
changes, no new tables, no new columns.

All changes stay inside the existing Supabase Edge Function draft pipeline (Route A):
`_shared/build-ai-context.ts`, `_shared/ai-providers.ts`, `_shared/generate-draft.ts`. Pure transforms
(role normalization, history filtering, response parsing, context formatting) are unit-tested with
`Deno.test`; thin DB-glue is typechecked on top.

## 4. Component designs

### 4.1 Timing gate — keep what exists (no code)

The existing trailing 120s window is the "is the customer done?" gate. Plan 2 does **not** touch it.
Documented here so future readers don't re-add a redundant timer. (`ai_draft_debounce_seconds`
remains the single tunable.)

### 4.2 Context completeness (`build-ai-context.ts`)

**C1 — Exclude unsent DRAFTs from dialogue history.** Today `getRecentMessages` selects
`status IN ('SENT','DRAFT')`. A rejected or stale AI draft then appears in history as `[assistant]`,
indistinguishable from a sent reply — the model believes it already answered and re-asks or
contradicts itself. **Fix:** dialogue history is built from `status = 'SENT'` only. (Inbound customer
messages are always `SENT`; sent staff/AI replies are `SENT`; only un-sent drafts are excluded.)

**C2 — Treat staff + AI as one "our side."** `consolidateMessages` merges by raw role string, but
`'staff'` and `'assistant'` are distinct strings that both map to the API `assistant` turn — yielding a
fragmented or non-alternating view of our side (and a latent Anthropic/Gemini alternation error as
history grows). **Fix:** a pure `normalizeRole(role) → 'customer' | 'assistant'` (staff → assistant)
applied before consolidation, so the model sees a clean alternating thread of everything we actually
told the customer.

**C3 — Resolvable order references.** So *"ano na nangyari sa binili ko / tinanong ko"* resolves
instead of guessing:
- Label the **most recent order** explicitly in the formatted context (e.g. a `most recent` marker on
  the newest of active/recent orders).
- Attach **human-readable item names** to order lines (brand + model), not just P-codes, so the model
  can say "your iPhone 13 order ORD000123." (Requires extending the order-items select/format; keep the
  existing P-code too for staff traceability.)

### 4.3 Clarify-don't-guess rule (`ai-providers.ts`)

A new exported code constant `CLARIFY_BEFORE_ASSUMING_RULE`, appended to the system prompt in
`generateAIReply` alongside `INVENTORY_RESPONSE_RULE`. Content (final wording fixed in the plan):

1. The trailing customer messages are **one request** (sent as a burst) — answer them together.
2. **Read the full conversation above first. Never re-ask anything already asked or answered earlier
   in the thread.**
3. For vague references ("my order", "what I asked", "ano na nangyari"), **resolve from the Customer /
   Orders context first.** If exactly one obvious order or topic matches, use it.
4. Only if it is genuinely ambiguous (multiple candidates, or nothing in context) ask **one short,
   specific** clarifying question that cites the concrete detail you have
   (e.g. "Order ORD000123 (iPhone 13) po ba ang tinatanong nyo?") — never a generic
   "ano pong tanong nyo?".
5. If the latest message is a bare screenshot or a fragment with no clear ask, briefly say what you see
   and ask one specific question. **Do not guess.**
6. **Never invent facts** (price, stock, order status, tracking) that are not present in the context.

This is the stable behavioral contract; business tone/wording stays in the DB persona + guardrails.

### 4.4 Clarification signal (output contract)

Add `needs_clarification` (boolean) to the JSON response contract in all four provider call sites,
thread it onto the `AIResponse` interface (optional, default `false`), and extract it in
`parseAIResponse`. Purpose: telemetry now ("how often is the bot asking vs answering?") and the exact
signal Plan 5 (autonomy phasing) needs to **never auto-send** a clarifying question. No behavior change
in Plan 2 beyond recording it (it may optionally be stored on the draft's `ai_context_summary` JSON in
`generate-draft.ts`).

## 5. Testing strategy

Pure functions get `Deno.test` coverage first (TDD):

- `normalizeRole` + consolidation: `'staff'` and `'assistant'` collapse to one assistant side;
  customer/assistant alternation preserved; consecutive same-side merged.
- SENT-only history filter: un-sent DRAFT assistant rows are dropped; SENT customer/staff/assistant
  rows kept in chronological order.
- `parseAIResponse`: extracts `needs_clarification` true/false; defaults to `false` when absent or on
  unparseable responses.
- Order-context formatter: renders a "most recent order" marker and human-readable item names.
- Prompt assembly: `generateAIReply`'s enhanced prompt includes `CLARIFY_BEFORE_ASSUMING_RULE`.

Thin DB-glue (the SENT-only select, extended order-items select) is typechecked with `deno check`.
Per the project gotcha, pre-existing `never`-type errors on untyped Supabase `.select/.insert` literals
are **not** regressions — only new non-never errors are flagged.

## 6. Out of scope (YAGNI / deferred)

- Completion-signal early trigger and any new silence-window column (D1).
- Router + specialist playbooks (Plan 3).
- Graceful handoff, HID inbox, `message_tickets` (Plan 4) — `needs_clarification` is recorded here but
  not yet wired to auto-send suppression.
- Autonomy phasing toggles (Plan 5).
- Any change to the 120s timing or the cron (D2).

## 7. Files (reference)

- **Modify** `supabase/functions/_shared/build-ai-context.ts` — `normalizeRole` (pure), SENT-only
  history, most-recent-order marker + item names; tests in `build-ai-context.test.ts`.
- **Modify** `supabase/functions/_shared/ai-providers.ts` — `normalizeRole` usage in
  `consolidateMessages` path, `CLARIFY_BEFORE_ASSUMING_RULE`, `needs_clarification` in the four
  contracts + `AIResponse` + `parseAIResponse`; tests in `ai-providers.test.ts`.
- **Modify** `supabase/functions/_shared/generate-draft.ts` — (optional) persist `needs_clarification`
  into the draft's `ai_context_summary`.
- No migrations.
