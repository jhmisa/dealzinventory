# AI Training & Memory — Design

**Date:** 2026-07-02
**Branch:** builds on `feat/canned-responses-ai-consolidation` (all work ships together, including the bundled bug fix)
**Status:** Design — awaiting user review before planning

---

## Problem

The AI messaging auto-reply is good, but staff have no way to *continuously teach it*. Two representative failures:

1. **Battery %** — Customer asked the battery life percentage of an "HP Elite Dragonfly G1". The data exists (`items.battery_health_pct` is a real per-unit field), but the AI has no tool to reach a specific item's structured specs — its only tool, `search_inventory`, returns a compact description string. The AI deflected to "check HP's website." **Root cause: retrieval gap.**

2. **SIM card** — Customer asked if a tablet takes a SIM. The AI answered "yes" with no qualification. The data exists (`product_models.has_cellular`), but the AI lacks the business rule ("only cellular-capable models take a SIM — check the model's cellular flag") and never looked up that specific model. **Root cause: knowledge + reasoning gap.**

Separately, there is **no correction/feedback loop today**. When staff edit a bad draft before sending, the correction is discarded — the AI never learns from it.

And a **latent correctness bug** compounds this (see Pillar 0): editing a draft and sending can transmit the *original* text.

## Goals

- Give staff a curated way to teach the AI durable rules and one-off corrections.
- Give the AI a dependable memory that injects the *relevant* learned context for each incoming message — even when the customer phrases it in Taglish or differently from how the rule was written.
- Let the AI answer specific per-unit factual questions (battery %, cellular/SIM, ports, condition) by looking up real data.
- Fix the edit-send correctness bug.

## Non-goals (YAGNI)

- No model fine-tuning.
- **No silent auto-capture** on draft edit/reject — staff confirmed this would poison the memory with cases that were never the AI's fault (multi-intent, unanswerable messages).
- v1 semantic retrieval covers the new corrections memory only. `knowledge_base` / `company_facts` keep their current always-inject behavior.
- Spec lookup does not enumerate every matching unit; it returns the exact unit when a code is known, else a representative/model-level answer.

---

## Architecture overview

Everything plugs into the existing prompt-assembly pipeline. Nothing is rebuilt.

```
Customer message
      │
      ▼
[Classify]  intent + sub-intent            (exists: sub-intents.ts / classifyMessage)
      │
      ├─▶ [Memory retrieval]  embed message → semantic-match APPROVED corrections,
      │                        scoped by classified specialist (fallback: unscoped top-K)
      ▼
[Assemble prompt]  guardrails + persona + company facts + specialist playbooks
                   + knowledge_base (incl. PROMOTED rules)     ← always-on rules
                   + "# Learned Corrections" (top ~3 matches)  ← NEW few-shot memory
      │
      ▼
[Draft]  tools:  search_inventory  +  get_item_specs           ← NEW live spec lookup
```

Key existing files touched:
- `supabase/functions/_shared/build-specialist-prompt.ts` — add the `# Learned Corrections` section.
- `supabase/functions/_shared/generate-draft.ts` — memory retrieval step; new tool executor case; embed incoming message.
- `supabase/functions/_shared/ai-providers.ts` — define `GET_ITEM_SPECS_TOOL`; offer it alongside `SEARCH_INVENTORY_TOOL`; add the "look up before answering / ask for code" prompt rule.
- `supabase/functions/_shared/send-via-missive.ts` — Pillar 0 bug fix.
- `src/components/messaging/ai-draft-card.tsx` + conversation thread — "Correct this" entry point.
- `src/pages/admin/messaging-settings.tsx` — Training page/tab.

---

## Pillar 0 — Fix the edit-send bug (bundled)

**Root cause** (`supabase/functions/_shared/send-via-missive.ts`): when an edited draft is approved, the edited `content` is sent to Missive on the first attempt, but the surviving draft `messages` row is marked `SENT` updating only `status` and `auto_sent` (line ~165) — it never persists the edited `content`, and the temporary carrier row holding the edit is deleted (line ~166). Consequences:

- The thread refetches and shows the **original** text (looks like the edit was ignored).
- `retryFailedMessage` re-reads that row and genuinely resends the **original** unedited text to the customer.

**Fix:** when marking the draft row `SENT`, also persist `content` (and `attachments`) onto that row. Add a regression test asserting the draft row's stored `content` equals the edited text after an approved-edit send, and that a retry resends the edited text.

---

## Pillar 1 — `get_item_specs` tool

A second AI tool alongside `search_inventory`, offered on the OpenRouter tool-calling path (`runChatCompletionWithTools`).

**Tool definition** (`ai-providers.ts`, mirroring `SEARCH_INVENTORY_TOOL`):
- `code` (string, optional) — a P/G/B code if present in the conversation/offer context.
- `query` (string, optional) — a model name extracted from the ad/offer (e.g. "HP Elite Dragonfly G1").

**Executor** (`generate-draft.ts`, new case): calls a new RPC `get_item_full_specs`.

**Resolution order (per business rule):**
1. **Code present → exact unit.** Return that unit's real structured specs and price.
2. **No code → model-level best effort.** Match by model name, return the representative model/config specs. The AI's reply then gives the best answer it can *and closes by asking for the product code* so it can quote the exact battery % and price (per-unit values vary). This doubles as a sales nudge.

**Return shape** — a structured object (not a flattened string) so the model reasons field-by-field. Includes, when available: `item_code`/`sell_group_code`, `model_name`, `brand`, `battery_health_pct`, `has_cellular`, `has_touchscreen`, `is_unlocked`, `carrier`, `cpu`, `gpu`, `chipset`, `ram_gb`, `storage_gb`, `screen_size`, `os_family`, `ports`, `color`, `condition_grade`, `condition_notes`, `price`, plus a `resolved_by: "code" | "model"` flag and `units_may_vary: boolean`.

**Prompt rule** (added near `INVENTORY_RESPONSE_RULE`): "For specific factual questions about a listed item (battery %, cellular/SIM, ports, exact specs), call `get_item_specs` before answering. Prefer a product code; if none is available, answer at the model level from the specs and ask the customer for the product code so we can confirm exact specs and price. Never deflect to the manufacturer's website."

Data sources are already present: `items.battery_health_pct`, `product_models.has_cellular`, `config_groups`, and the spec-label mapping in `item-description.ts` / `src/lib/constants.ts`.

---

## Pillar 2 — AI Memory (corrections + retrieval)

### New table `ai_corrections`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `customer_message` | text | the triggering question |
| `wrong_reply` | text null | what the AI said (if captured from a draft) |
| `correct_reply` | text | what it should say |
| `note` | text null | short explanation / why |
| `specialist_slug` | text null | scoping tag (from draft `ai_context_summary`) |
| `sub_intent_slug` | text null | scoping tag |
| `status` | text | `PENDING` → `APPROVED` → `PROMOTED` / `REJECTED` |
| `embedding` | `vector(384)` | of `customer_message` (+ optionally `correct_reply`); `gte-small` dims |
| `source_conversation_id` | uuid null | provenance |
| `source_message_id` | uuid null | provenance |
| `promoted_knowledge_id` | uuid null | FK to `knowledge_base` when promoted |
| `created_by` | uuid null | staff auth.uid() |
| `created_at` / `updated_at` | timestamptz | |

RLS + grants follow the `knowledge_base` convention (staff-only writes via `auth.uid()`; `ALTER DEFAULT PRIVILEGES` already covers new-table grants per CLAUDE.md). `pgvector` extension enabled if not already.

### Retrieval (hybrid: tags + semantic)

At draft time, after classification:
1. Embed the incoming customer message using Supabase's built-in `gte-small` model (384 dims) via `Supabase.ai.Session('gte-small')` — runs locally inside the edge function, no external API key or per-call cost.
2. RPC `match_ai_corrections(query_embedding, specialist_slug, match_count, min_similarity)`:
   - Filter `status = 'APPROVED'`.
   - **Scope** by `specialist_slug`; if fewer than `match_count` hits, top up with an unscoped similarity search (fallback so a thinly-tagged domain still gets help).
   - Order by cosine similarity; return top ~3 above a similarity floor.
3. Inject as a `# Learned Corrections (apply these)` section in `buildSpecialistSystemPrompt`, each entry rendered as a compact wrong→right example with its note.

### Promotion ("both" model)

- A correction is a **few-shot example** by default (retrieved by similarity).
- **Promote** turns it into a **durable rule**: write a tagged entry into the *existing* `knowledge_base` (`entry_type='knowledge'`, `specialist_tags`), set the correction's `status='PROMOTED'` and `promoted_knowledge_id`. Promoted rules are always-injected via the existing machinery; the raw example remains available for semantic match.
- Because rules live in `knowledge_base`, Claude (in a session) can write rules/corrections directly via SQL — the same memory staff use through the UI.

### Embedding generation

Use Supabase's built-in `gte-small` model via `Supabase.ai.Session('gte-small')` inside the edge function (OpenRouter has no embeddings endpoint, so it can't do this part). Runs locally in the Deno edge runtime — **no external API key, no new provider, no per-call cost**. Embeddings are generated both when a correction is saved/approved (stored in the `embedding` column) and for the incoming message at draft time. Vectors are 384-dim; no caching in v1.

---

## Pillar 3 — Capture UI + Training page (curated only)

### "Correct this" entry point
On any AI draft/sent message in the conversation thread (`ai-draft-card.tsx`), a "Correct this" action opens a dialog prefilled with:
- the customer message,
- the AI's reply (as `wrong_reply`),
- intent tags (`specialist_slug` / `sub_intent_slug` from the draft's `ai_context_summary`),
- empty `correct_reply` + `note` fields.

Saves as `status='PENDING'`. Deliberate action only — there is **no** silent capture on edit/reject.

### Training page (Messaging Settings)
A tab/section in `messaging-settings.tsx`:
- **Review queue** — list PENDING corrections; approve / edit / reject.
- **Approved list** — promote to a rule (writes to `knowledge_base`); view what's promoted.
- **Add manually** — author a correction from scratch.
- **Test** — re-run a case through the existing `test-ai-reply` harness to confirm the AI now answers correctly.

Embeddings are (re)generated on save/approve.

---

## Testing strategy

- **Embeddings:** confirm `Supabase.ai.Session('gte-small')` is available in the project's edge runtime and produces 384-dim vectors (guard the plan against a runtime-version surprise).
- **Pillar 0:** regression test — approved-edit send persists edited `content` to the draft row; retry resends edited text.
- **Prompt assembler:** extend `build-specialist-prompt.test.ts` — `# Learned Corrections` section renders matched examples in the right position and is omitted when none match.
- **Retrieval:** test `match_ai_corrections` scoping + unscoped fallback + similarity floor.
- **Tool:** test `get_item_full_specs` resolution order (code → exact; no code → model-level + `units_may_vary`); test `get_item_specs` executor wiring.
- **End-to-end (harness):** the two canonical cases — battery % (with and without code) and SIM/cellular — produce correct drafts.

---

## Open items to confirm during planning

- Exact placement of the Training UI (new tab in `messaging-settings.tsx` vs. its own route).
- Whether to embed `customer_message` only, or `customer_message + correct_reply`, for best match quality.
