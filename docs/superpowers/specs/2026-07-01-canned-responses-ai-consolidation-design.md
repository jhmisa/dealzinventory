# Spec — Consolidate Canned Responses into the AI Agent's Knowledge

**Date:** 2026-07-01
**Branch (current):** `feat/catalog-product-photos` (new work will branch from `main`)
**Status:** Design approved (2026-07-01), pending spec review.

---

## 1. Problem

The Dealz messaging system has **two disjoint knowledge stores** that have drifted apart:

1. **Canned Responses** (staff-facing "Responses" panel) — table `messaging_templates`. Staff-authored Taglish replies with a Japanese variant, `{{variables}}`, and inline photo attachments. 20 live templates today, all `is_active`. This is the richer, "more complete" library.
2. **AI Agent knowledge** — a separate layered stack: `messaging_persona` (voice) + `knowledge_base` (facts + guardrails) + `messaging_specialists` (playbooks) + `messaging_sub_intents` (per-intent handling + OFF/DRAFT/SEND autonomy). Assembled at draft time in `supabase/functions/_shared/build-specialist-prompt.ts`.

**The AI drafting code never reads `messaging_templates`.** When staff improve a canned reply, the AI never learns it; when the AI's knowledge is improved, the canned responses fall behind. Improving one and forgetting the other is the core failure.

**Conflict rule (from the user):** when the two disagree, **the canned response wins** — it is the more complete, human-curated truth.

---

## 2. Goal

Make the canned-response library (`messaging_templates`) the **single authoritative source** that both staff and the AI draw from — read **live** by the AI at draft time, so nothing is copied and nothing can drift. Plus a content-quality pass on the 20 templates first (better English, real Japanese).

**Approach (decided 2026-07-01):** *logical unification, physical separation.* Keep `messaging_templates` and `knowledge_base` as separate physical stores (each tuned to its shape and dependents), but present them through **one unified "Agent Knowledge" management surface** so staff experience a single knowledge area. The fact-vs-sendable-message distinction (`entry_type` / `ai_usage`) persists regardless of table count, so a physical merge would buy editing-UX, not data integrity — at much higher migration risk. Deferred, not chosen.

**Non-goals (YAGNI):** merging the two tables into one physical store (revisit only if the org goes fully AI-first); a generic bidirectional sync engine; a standalone "drift detector" dashboard. Live-read + de-duplication + a unified editing surface achieves single-source without them.

---

## 3. Key facts discovered (grounding)

### Canned responses
- Table **`messaging_templates`** — `supabase/migrations/20260412100000_messaging_tables.sql`. Columns: `id`, `name` ("Category: Subject" free-text convention), `description`, `content_en`, `content_ja`, `message_type` (`REPLY|REVIEW_REQUEST|DELIVERY_ALERT`), `variables text[]`, `is_active`, `attachments jsonb` (added `20260414030000_messaging_attachments.sql`; inline `[{file_url,filename,mime_type,size_bytes}]`, files in Storage bucket `messaging-attachments` under `templates/<id>/`).
- Service: `src/services/messaging.ts` (`getTemplates`/`createTemplate`/`updateTemplate`/`deleteTemplate`, attachment helpers). Hooks: `src/hooks/use-messaging.ts`.
- UI: `src/components/messaging/canned-responses-panel.tsx` (the "Responses" Sheet), `src/components/messaging/canned-response-form.tsx` (Create/Edit; `AVAILABLE_VARIABLES = ['customer_name','customer_code','order_code']`).
- Variables: `src/lib/template-variables.ts` — `resolveTemplateContext(conversation)` builds `{customer_name, customer_code, order_code}`; `resolveVariables(content, ctx)` replaces `/\{\{(\w+)\}\}/g`.

### The 20 live templates (2026-07-01)
Categories by `name` prefix: Order (6), Info (4), Acctg (3), Concern (2), Tracking (2), After (1), no-prefix (2 → `Lost`, `Office Location`).

**Contain human fill-in blanks or non-derivable data (NOT auto-sendable verbatim):**
`Acctg: PayPal Payment` (payment link), `Acctg: SmartPit Payment` (SmartPit #, Amount), `Order: Offer Link` (blank link), `Order: Japan Invoice` / `Order: Philippines Invoice` (order details block), `Order: Manual Process` (collects customer details), `Order: Special Request` (Unit/Price/Downpayment), `Tracking: LBC` / `Tracking: Yamato` (tracking #).

**Self-contained (candidates for AUTO / near-verbatim):**
`Acctg: Payment Confirmation` (has `{{order_code}}`), `After: Feedback`, `Concern: Redelivery` (has `{{order_code}}`), `Concern: Warehouse Address`, `Info: Basic Greeting`, `Info: Express Service`, `Info: Probing`, `Info: Ranking and Warranty`, `Lost`, `Office Location`, `Order: How to Checkout`.

**Photos:** 6 templates have attachments (`Acctg: PayPal Payment`, `Acctg: SmartPit Payment`, `Concern: Redelivery`, `Info: Express Service`, `Info: Ranking and Warranty`, `Order: Special Request`).

**Japanese variant is broken:** 11 of 20 `content_ja` contain **zero Japanese characters** (they're English/Taglish); only ~5 are mostly Japanese. The JA field must be rewritten as real Japanese.

### AI agent stack
- Tables: `messaging_persona` (`system_prompt`, `language_style`, `use_emojis`, `greeting_template`), `knowledge_base` (`entry_type knowledge|guardrail`, `title`, `content`, `category`, `is_active`, `sort_order`, `specialist_tags text[]`), `messaging_specialists` (`slug`, `name`, `intents text[]`, `playbook`, `always_escalate`, `auto_send_eligible`, `target_folder`), `messaging_sub_intents` (`specialist_id`, `slug`, `name`, `recognition_cues`, `handling_instructions`, `autonomy OFF|DRAFT|SEND`, `target_folder`). Seeded specialists: `sales`, `order_tracking`, `aftersales`, `kaitori`, `generalist`. Autonomy threshold: `system_settings.auto_send_confidence_threshold` (default 0.85).
- Drafting core: `supabase/functions/_shared/generate-draft.ts` (`generateAndSaveDraft`), `supabase/functions/_shared/build-specialist-prompt.ts` (prompt assembly), `supabase/functions/_shared/sub-intents.ts` (classify + autonomy), `supabase/functions/_shared/ai-providers.ts` (`generateAIReply`/`classifyMessage`).
- Entry points: `supabase/functions/missive-webhook/index.ts` (stamps `conversations.draft_pending_since`), `supabase/functions/generate-pending-drafts/index.ts` (cron → `generateAndSaveDraft`), `supabase/functions/send-message/index.ts` (send/approve), `supabase/functions/test-ai-reply/index.ts` (Test-AI playground).
- Settings UI: `src/pages/admin/messaging-settings.tsx`.
- **The AI never queries `messaging_templates` today.** No shared data.

---

## 4. Design

### Phase 0 — Content improvement (do first)
Refine all 20 templates. **Depth = "Refine (medium)".**
- **`content_en`:** polish tone/grammar/emoji/`po` usage; light restructure for clarity (ordering, CTAs, consistent greeting + sign-off); preserve every fact/link/price. Convert manual blanks to `{{variables}}` **only where a context value exists**: keep `{{order_code}}`; add support for `{{tracking_number}}`, `{{courier}}`, `{{delivery_date}}`. Values not derivable from context (SmartPit #, PayPal amount, offer link, invoice line items) stay as human blanks.
- **`content_ja`:** rewrite as proper polite business Japanese (keigo), a faithful translation of the improved EN. **(Assumption — vetoable at spec review:** JA is a straight translation of the same customer message, not a re-aimed Japan-business message.)
- **Delivery / review gate:** produce a Markdown **review table** (current EN → proposed EN → proposed JA → notes) for all 20; user approves (batches OK). Apply via a **version-controlled data migration** that `UPDATE`s each template by `name`. No silent runtime edits.
- **New variables** require extending `resolveTemplateContext` (`src/lib/template-variables.ts`) and `AVAILABLE_VARIABLES` (`canned-response-form.tsx`) plus the edge-side context builder used at draft time.

### Phase 1 — Make templates AI-aware (schema)
Migration adds to `messaging_templates`:
- **`specialist_slug text`** (nullable FK-by-slug to `messaging_specialists.slug`) and optional **`sub_intent_slug text`** — scopes which templates the AI is shown per conversation. (Slug-based to match the existing `specialist_tags` convention and avoid brittle id coupling.)
- **`ai_usage text` enum-checked** — one of `AUTO`, `DRAFT`, `REFERENCE`, `OFF`:
  - `AUTO` — self-contained; may be sent near-verbatim (subject to autonomy).
  - `DRAFT` — AI may use; always lands as a human-approved draft.
  - `REFERENCE` — AI reads as authoritative fact; never sent verbatim (e.g. has blanks).
  - `OFF` — hidden from the AI entirely.
  - Default for existing rows seeded per the classification in §3 (self-contained → `AUTO`/`DRAFT`; blank/data templates → `REFERENCE`; pure payment-link ones may be `OFF`).
- Grants/RLS: inherit via `ALTER DEFAULT PRIVILEGES` (already set project-wide); no new table so no extra boilerplate.

### Phase 2 — AI reads matching templates at draft time (wiring)
- In `build-specialist-prompt.ts`: after specialist/sub-intent classification, load active, non-`OFF` templates for that specialist (and matching sub-intent when set). Inject an **"Approved Replies"** section: for each → `name`, `content_en`, `has_photo`, `ai_usage`.
- Prompt instruction: *these are approved canonical replies; prefer their exact wording, fill `{{variables}}`; where they conflict with any other knowledge, THESE WIN.*
- **Effective auto-send = stricter of** the sub-intent `autonomy` (OFF/DRAFT/SEND) **and** the template `ai_usage`. A `REFERENCE` template can never auto-send even under a SEND sub-intent.
- **Media (photo/video):** the reply pass returns a `used_template_id` (structured field, mirroring how the existing AI-offer photo path returns a code rather than model markdown). If that template has `attachments` (image or video), `generate-draft.ts` attaches them to the draft/message. Files already live in `messaging-attachments`; reuse the existing attachment-send path in `send-message`.
- Confidence/telemetry: record the chosen template id in the existing AI context/usage logging so we can audit which templates the AI uses.

### Phase 3 — Reconcile the knowledge_base (deferrable, but recommended now)
De-duplicate `knowledge_base` articles whose facts are now owned by a template (shipping fee, payment options, express service, warranty/ranking): trim or retire the overlapping KB entry so the template is the sole source. Proposed KB edits listed in the same review table. **This phase is isolated so it can ship as a follow-up without blocking Phases 0–2.**

### Phase 4 — Unified "Agent Knowledge" management surface
Deliver the "one knowledge area" experience over the two physical tables.
- In Settings → AI Agent (`src/pages/admin/messaging-settings.tsx`), add a unified **Agent Knowledge** view that lists **both** `knowledge_base` entries **and** `messaging_templates` (canned messages) together — one filterable list with an entry-type/`ai_usage` filter and the specialist taxonomy shared across both. Editing either kind happens from this one surface.
- Extend the canned-message editor (`canned-response-form.tsx` + `messaging-templates` service/hooks + types) with the **specialist/sub-intent picker** and **`ai_usage` selector** from Phase 1, plus **photo _and video_ attachments** (the `attachments jsonb` model is `mime_type`-agnostic; add video upload/preview; images still follow the 1080/256 WebP standard, video stored as-is in `messaging-attachments`).
- The staff **Responses panel stays** as the fast "insert / send" projection of the canned-message subset (a filtered view of the same data) — the human quick-reply workflow is unchanged.
- Surface a small badge on both the Responses panel and the unified view showing each template's `ai_usage` (AUTO / DRAFT / REFERENCE / OFF) so staff see at a glance how the AI treats it.

---

## 5. Data flow (after)

```
Inbound customer msg
  → missive-webhook stamps draft_pending_since
  → generate-pending-drafts (cron) → generateAndSaveDraft
      → classify specialist + sub_intent (autonomy)
      → build-specialist-prompt:
            Guardrails → persona → specialist playbook
            → tagged knowledge_base (deduped)
            → **Approved Replies (messaging_templates for this specialist)**  ← NEW
      → reply pass returns { reply_text, used_template_id?, confidence }
      → effective_autonomy = min(sub_intent.autonomy, template.ai_usage)   ← NEW
      → attach used_template photos if any                                   ← NEW
      → insert DRAFT (or auto-send if effective_autonomy=SEND & conf≥thresh)
```

---

## 6. Error handling & edge cases
- No matching template → behave exactly as today (KB/playbook only). Pure additive; must not regress current drafts.
- Template with unresolved `{{variables}}` (missing context) → do not auto-send; downgrade to DRAFT (treat like `REFERENCE` for that turn).
- `ai_usage = OFF` or `is_active = false` → never surfaced to the AI.
- Prompt-size guard: only inject the current specialist's templates (not all 20) to control token growth; if a specialist has many templates, cap/sort by `sort_order` and log what was dropped (no silent truncation).
- Migration idempotency: `UPDATE ... WHERE name = ...`; if a template was renamed/deleted in prod since harvest, the update is a no-op — log mismatches rather than insert duplicates.

## 7. Testing
- **Test-AI playground** (`test-ai-reply`) scenarios: "magkano shipping/payment?" → uses Basic Greeting/Express wording; "saan ko ipapadala warehouse?" → `Concern: Warehouse Address` verbatim (correct address); "pano mag-checkout?" → `Order: How to Checkout`; SmartPit/PayPal question → **never** auto-sent verbatim (REFERENCE/OFF respected); a photo template → photo attaches to the draft.
- Autonomy matrix test: SEND sub-intent × REFERENCE template ⇒ DRAFT, not auto-send.
- Regression: a conversation with no matching template still drafts as before.

## 8. Migrations & versioning
- Migration A: content improvements (`UPDATE` 20 templates, EN + JA).
- Migration B: schema (`specialist_slug`, `sub_intent_slug`, `ai_usage` + check + backfill defaults).
- Migration C (Phase 3): knowledge_base de-dup edits.
- Apply via Supabase CLI. Bump `package.json` once for the session. Deploy edge functions + frontend via `push-to-main`.

## 9. Open items to confirm at spec review
1. **JA translation intent** — faithful translation of the customer message (assumed) vs re-aimed at a Japan-business audience.
2. **Phase 3 timing** — reconcile knowledge_base now (assumed) vs defer to a follow-up.
3. **Default `ai_usage` seeding** — confirm the AUTO/DRAFT/REFERENCE/OFF assignment per template (proposed in the review table).
