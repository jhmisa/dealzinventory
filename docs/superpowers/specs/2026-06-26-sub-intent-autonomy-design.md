# Sub-Intent Taxonomy & Per-Intent Autonomy — Design Spec

**Date:** 2026-06-26
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** v1 = Tiers 1 & 2 (conversational + data-read sub-intents). Tier 3 (action-taking) is explicitly deferred.

---

## Problem

The AI messaging system today classifies every inbound customer message into one of ~8 fixed intents (`product_inquiry`, `tracking`, `order_status`, `return`, `complaint`, `kaitori`, `general`, `unknown`), routes it to one of 5 specialists, and **always saves a DRAFT** for human approval. Two limitations:

1. **No disambiguation for novel situations.** A promo/raffle message ("we'll raffle this ¥19,900 watch for ¥4,900 — *is this still available?*") has no matching intent, so it falls through to `product_inquiry` → searches live inventory → answers "Yes, available!" — which is wrong and confuses the customer.

2. **Autonomy is all-or-nothing.** Every reply is a draft. There's no way to let the AI auto-send the cases it handles reliably (e.g. simple shipping-status lookups) while keeping risky cases (complaints) human-gated.

## Goal

Let staff define an **editable, two-level intent taxonomy** (Category → Sub-intent) where each sub-intent carries:
- **how to recognize it** (improves classification accuracy / disambiguation), and
- **how much autonomy it gets**: **OFF / DRAFT / SEND**.

A sub-intent is therefore: *a named situation + how to recognize it + how to handle it + how much autonomy it gets.*

---

## Capability tiers (framing)

Sub-intents fall into tiers of increasing capability and risk. **v1 covers Tiers 1 & 2 only.**

| Tier | Needs | Examples | In v1? |
|------|-------|----------|--------|
| 1 — Conversational | Handling text only | YeheyRemit partnership info, raffle/promo explanation | ✅ |
| 2 — Data-read | Read system data already in the prompt context | "Has my order shipped / been delivered?" | ✅ |
| 3 — Action-taking | Trigger a side-effect, often multi-turn | delivered → "yes it's here" → send review link | ❌ deferred |

Tier 2 needs **no new integration**: the AI's context block already includes each order's `tracking_number`, `shipped_date`, and `yamato_status` (polled from Yamato every 15 min by an existing cron). Reporting shipping status is purely a handling-instruction problem.

---

## Architecture

### 1. Data model

The existing `messaging_specialists` table **is** the editable Category level (and new categories like YeheyRemit can be added). One new child table:

```sql
CREATE TABLE messaging_sub_intents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialist_id         uuid NOT NULL REFERENCES messaging_specialists(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  name                  text NOT NULL,
  recognition_cues      text NOT NULL,            -- when the classifier should pick this
  handling_instructions text NOT NULL,            -- mini-playbook injected into the reply call
  autonomy              text NOT NULL DEFAULT 'DRAFT'
                          CHECK (autonomy IN ('OFF','DRAFT','SEND')),
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (specialist_id, slug)
);
```

- RLS + Data API grants per project convention (ALTER DEFAULT PRIVILEGES already handles new-table grants).
- Seed sub-intents for the existing specialists (at minimum a sensible set for Sales / Order-Tracking) plus a seeded `promo_raffle` example so the raffle case is fixed out of the box.
- Each Category keeps a built-in **default / catch-all** behavior (no sub-intent row needed) for messages that match the category but no specific sub-intent.

### 2. Classification (split from reply — two calls)

Today classification + reply happen in a single LLM call. v1 **splits them**:

**Call 1 — Classify (cheap, small output).**
Inject the full taxonomy (each active Category → its active sub-intents → recognition cues) and ask the model to return:
```json
{ "specialist_slug": "...", "sub_intent_slug": "..." | null, "confidence": 0.0-1.0 }
```
- `sub_intent_slug = null` → no specific sub-intent matched → **category default**.

**Branch on resolved autonomy (see §3):**
- **OFF** → stop here. No reply generated. Route conversation to folder + set `needs_human_review = true`.
- **DRAFT / SEND** → **Call 2 — Generate reply**, injecting *only the matched sub-intent's* `handling_instructions` (or the category default playbook) for a focused reply. Tools (`search_inventory`) offered as today, gated by the handling instructions.

Bonus from splitting: the reply prompt is now narrowly scoped to the matched sub-intent rather than carrying every specialist's playbook at once.

### 3. Autonomy resolution + enforcement

Resolve an **effective autonomy** from the matched sub-intent, then apply safety downgrades:

```
effective = matched_sub_intent.autonomy   (or 'DRAFT' if category default / no match)

DOWNGRADE to DRAFT if:
  - sub_intent_slug is null (category default / novel)         -- rule 2
  - confidence < auto_send_confidence_threshold (global setting) -- rule 2
  - matched specialist.always_escalate = true                  -- rule 3

OFF stays OFF (never auto-promoted).
Global kill switch (ai_messaging_enabled=false) → no AI action at all. -- rule 4
```

Apply:
- **OFF** → no draft; route + flag for human.
- **DRAFT** → save message `status='DRAFT'` (current behavior).
- **SEND** → save the reply, then **immediately auto-approve it through the existing `send-message` edge function** (the same path staff use to approve a draft). Reuses all current send infrastructure. Mark `auto_sent = true` and stamp the matched sub-intent.

### 4. Safety rails (non-negotiable)

1. Every new sub-intent **defaults to DRAFT**; SEND is always a deliberate opt-in.
2. **Unmatched / low-confidence / category-default → forced DRAFT**, never SEND.
3. Specialists with **`always_escalate = true` (Aftersales, Kaitori) cannot SEND** — capped at DRAFT.
4. The **global kill switch** overrides everything.
5. Every **auto-sent message is flagged (`auto_sent`) and reviewable** for spot-checking.

### 5. Message / observability changes

On the messages (or `ai_context_summary`) record, capture: matched `specialist_slug`, `sub_intent_slug`, `confidence`, resolved `autonomy`, and `auto_sent` boolean. Surface auto-sent messages distinctly in the Messages UI so staff can audit what the AI sent unattended.

### 6. Admin UI

Extend the **Specialist Playbooks** section of `src/pages/admin/messaging-settings.tsx`:
- Each Category expands to list its sub-intents.
- Each sub-intent row: Name, Recognition cues, Handling instructions, and a 3-way **OFF / DRAFT / SEND** segmented toggle; active toggle; reorder.
- "Add category" and "Add sub-intent" actions.
- One global setting: **auto-send confidence threshold** (below which SEND → DRAFT).

---

## Affected code (anchors)

| Area | File |
|------|------|
| Sub-intent table + seed | new migration in `supabase/migrations/` |
| Specialist prompt assembly | `supabase/functions/_shared/build-specialist-prompt.ts` |
| Draft orchestration (split classify/reply, autonomy) | `supabase/functions/_shared/generate-draft.ts` |
| LLM call + tools | `supabase/functions/_shared/ai-providers.ts` |
| Cron draft entry | `supabase/functions/generate-pending-drafts/index.ts` |
| Auto-send reuse | `supabase/functions/send-message/index.ts` |
| Intent routing (folders) | `supabase/functions/_shared/intent-routing.ts` |
| Admin UI | `src/pages/admin/messaging-settings.tsx` |
| Data layer | `src/services/messaging.ts` |

---

## Out of scope (v1)

- **Tier 3 action-taking** sub-intents: auto review-link send, multi-turn state machines. (The review-link flow also needs an actual review URL, which does not exist today, and must reconcile with the existing 48h `queue_review_requests` cron.)
- Any new Yamato / shipping integration — Tier 2 reads existing context.

## Testing

- Classification: raffle message → `promo_raffle` (not `product_inquiry`); shipped/delivered questions → tracking sub-intents.
- Autonomy resolution unit tests for all five safety rails (default DRAFT, low-confidence downgrade, null → DRAFT, always_escalate cap, kill switch).
- SEND path: end-to-end that an auto-sent message transmits via `send-message` and is flagged `auto_sent`.
- OFF path: no draft created; conversation routed + `needs_human_review` set.
