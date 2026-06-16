# Messages AI Agent Redesign — Design Spec

**Date:** 2026-06-16
**Status:** Approved (design) — pending implementation plan
**Owner:** Joey (Dealz K.K.)

---

## 1. Problem

The AI auto-reply bot in **Admin → Messages** has three operational problems:

1. **Replies too fast and assumes too much.** It answers before the customer has finished
   explaining, and guesses instead of asking/confirming.
2. **Blind to screenshots.** When a customer sends "Meron pa ba nito" + a photo, the AI only
   sees the text. The image is ignored.
3. **No workflow for the messy cases.** There is no way to (a) group a burst of messages into
   one intent, (b) route topics to the right handling, or (c) cleanly escalate the things the AI
   shouldn't answer to a human.

Joey also raised a strategic question: keep improving the **internal, pay-per-use** AI (Route A),
or move to an **external machine running a $100/mo Claude/ChatGPT subscription with autonomy**
(Route B).

## 2. Decision: Route A (improve in place)

**We stay on Route A and improve it.** Route B is rejected for concrete reasons found in the codebase:

- **Sending is already human-gated.** Every AI reply is saved as a `DRAFT` (`messages.status='DRAFT'`)
  and a human approves it in `ai-draft-card.tsx`. The "assumes too much" complaint is a **draft-quality**
  problem, not an autonomy problem. Route B's defining feature (more autonomy) makes complaint #1 worse.
- **The screenshot fix is wiring, not architecture.** Inbound images are already downloaded to Supabase
  Storage (`missive-webhook/index.ts:462-507`), and vision code already exists (`_shared/ai-vision.ts`).
  Route B buys nothing here.
- **Route B can't be standalone.** Outbound replies go through a non-trivial Missive-specific rail
  (`send-message/index.ts`: Facebook PSID lookup, base64 attachment limits, Missive Drafts API). An
  external machine would have to re-implement or call this anyway.
- **Cost is unmeasured.** There is **zero** cost telemetry today, so the "unknown monthly cost" is unknown
  only because nothing measures it. With OpenRouter + a 1024-token cap + a 120s debounce, real cost is
  plausibly under $100/mo, making the flat subscription potentially *more* expensive.

## 3. Goals

| # | Goal | Approach |
|---|------|----------|
| G1 | Stop over-assuming | "Is the customer done?" gate before any reply |
| G2 | Understand screenshots | Wire existing vision code into the draft path |
| G3 | Correct Taglish | Use a strong vision-capable model; keep `taglish` persona |
| G4 | Group/bundle bursts | Combine rapid messages into one intent before replying |
| G5 | Specialist handling | Router + per-topic specialist playbooks |
| G6 | Human-in-the-loop (HID) | Graceful handoff flow + HID inbox + tickets |
| G7 | Off-hours coverage | Phased autonomy so the agent covers nights/weekends |
| G8 | Cost control | Per-draft token/cost telemetry |

## 4. Architecture

All changes live inside the existing Supabase Edge Function pipeline. No new machine, no subscription.

```
Customer msg → missive-webhook (already downloads images ✓)
            → "is the customer done?" gate                (NEW — replaces flat 120s timer)
            → Router classifies intent                    (NEW)
            → Specialist playbook: builds context,
              reads screenshots via ai-vision             (NEW wiring on existing vision code)
            → drafts reply
                 ├─ confident & allowed by phase → send via send-message (existing rail)
                 └─ unsure / human-only topic → gather info → "forwarding to team" → HID ticket (NEW)
```

Reused as-is: `ai-providers.ts` (provider dispatch), `build-ai-context.ts` (customer/order/inventory
context), `send-message/index.ts` (outbound rail), `knowledge_base` / `messaging_persona` (prompt
content), `conversations.needs_human_review` / `assigned_staff_id` / folders (escalation primitives).

## 5. Component Designs

### 5.1 "Is the customer done?" gate (G1, G4)

Replaces the flat 120-second debounce in the `generate-pending-drafts` cron path.

A reply is only generated when **either** condition holds:

- **Silence window:** no new customer message for **3 minutes** (default; tunable via
  `system_settings`), OR
- **Completion signal:** the latest text reads as a complete request (a clear question with enough
  detail, or an explicit closer like "...let me know ok?").

If the latest message is a **bare screenshot or a fragment with no ask**, the agent does NOT guess —
it either keeps waiting (within the window) or sends one short clarifying question. The whole burst
(all messages since the last staff/agent turn + their images) is bundled and treated as **one intent**.

### 5.2 Multimodal — see screenshots (G2, G3)

Images are already persisted in the `messaging-attachments` bucket. The draft path will fetch the
image bytes / signed URLs for the messages in the current burst and pass them to the model using the
existing `_shared/ai-vision.ts` helper (OpenAI-compatible base64 inline image). This requires the
active messaging model to be vision-capable (see §5.6).

### 5.3 Router + specialist playbooks (G5)

A lightweight **router** reads the complete burst (text + image) and classifies it into one intent,
mapped to the existing folders. Each specialist is a **persona + playbook + a filtered slice of
`knowledge_base`** — so a reply is never overloaded with every topic's information.

| Specialist | Folder | Scope | Auto-send eligibility |
|---|---|---|---|
| Sales / Product | Prospects | availability, specs, recommendations | safe facts yes; **price never auto-sends until Phase 3** |
| Order & Tracking | Order | order status, tracking, delivery | yes (high confidence) |
| Kaitori | (kaitori) | buying devices from customers, quotes | **never** (money + ID verification) |
| Aftersales / Complaint | Concern | returns, problems, angry tone | **never** (biased to escalate) |
| Technical | Technical | troubleshooting, device questions | yes (high confidence) |

Specialists can **hand off** to one another (e.g., a Sales conversation that turns technical re-routes).
The output contract already emits an `intent` field, which seeds the router.

Knowledge tagging: `knowledge_base` entries get an intent/topic tag so each specialist loads only its
relevant subset (plus shared guardrails).

### 5.4 Confidence + graceful handoff (G6)

- **Confidence gate:** the existing `ai_confidence` score gates auto-send (per phase rules in §5.5).
- **Human-only topics:** price quotes, kaitori offers, complaints, and unmatched/unknown customers
  always route to a human regardless of confidence.
- **Graceful handoff flow** (the core safety net that makes autonomy safe):
  1. If info is missing, ask the customer for it.
  2. Summarize back to confirm understanding.
  3. Tell the customer: *"I'll forward this to our team and they'll get back to you."*
  4. Create an **HID ticket** with a summary for staff.

### 5.5 HID inbox + tickets (G6)

- **HID inbox:** a new folder/view in the existing 4-pane Messages UI that filters
  `conversations.needs_human_review = true`, sorted by urgency/age.
- **Tickets:** a small new `message_tickets` table — `conversation_id`, `customer_id`, `intent`,
  `summary`, `what_is_needed`, `status` (open/resolved), `created_at`, `resolved_at`,
  `assigned_staff_id`. Created by the graceful-handoff flow; resolved by staff.
- Reuses `needs_human_review`, `assigned_staff_id`, and `system_alerts` primitives.

### 5.6 Cost telemetry + model choice (G3, G8)

- **Telemetry (build early):** log input/output tokens and estimated cost per draft (new columns or a
  small `ai_usage_log` table). This is the data needed to evaluate pay-per-use vs flat subscription
  with real numbers.
- **Diagnostic first:** read which model is live for `ai_providers` where `purpose='messaging'`. If it's
  the cheap `gemini-2.5-flash` OpenRouter default, that likely explains weak Taglish + over-assuming.
- **Recommended model:** **Claude Sonnet 4.5** for messaging (vision-capable, strong Taglish). This is a
  single DB row change and is likely the highest quality-per-effort win.

## 6. Autonomy phasing (G7)

Toggle-controlled via `system_settings`; the graceful-handoff/HID fallback is **always on** from day one.

- **Phase 1 (launch):** agent only drafts; staff approve every send. Tune the agent, watch quality.
- **Phase 2:** confident replies **auto-send off-hours/weekends** (when no staff are online); staff
  hours still draft-for-approval.
- **Phase 3:** auto-send expands to safe topics during staff hours. Price / kaitori / complaints
  **never** auto-send.

A small control panel governs: current phase, the silence window, off-hours schedule, and per-intent
auto-send rules — all without code changes.

## 7. Build order

1. **Fast wins:** run the model diagnostic, swap to Claude Sonnet 4.5, wire vision into drafts, add cost
   telemetry. *(May fix a large share of complaints on its own.)*
2. **"Is the customer done?" gate** + burst bundling. *(Fixes over-assuming.)*
3. **Router + 5 specialist playbooks** + knowledge tagging.
4. **Graceful handoff + HID inbox + `message_tickets`.**
5. **Autonomy phasing toggles** + control panel. *(Enable Phase 2 when ready.)*

## 8. Out of scope (YAGNI)

- Separate running machines / external subscriptions (Route B).
- Email/SMS channels (Messenger only for now; schema already allows future expansion).
- Multi-agent orchestration beyond router + handoff (no agent-to-agent negotiation).
- A/B testing of personas, SLA tracking, skill-based routing.

## 9. Key files & tables (reference)

- Edge: `missive-webhook/index.ts`, `generate-pending-drafts/index.ts`, `_shared/generate-draft.ts`,
  `_shared/ai-providers.ts`, `_shared/build-ai-context.ts`, `_shared/ai-vision.ts`,
  `send-message/index.ts`, `test-ai-reply/index.ts`.
- UI: `src/pages/admin/messages.tsx`, `src/components/messaging/*` (folder-sidebar, conversation-list,
  conversation-thread, ai-draft-card, message-composer), `src/hooks/use-messaging.ts`,
  `src/services/messaging.ts`.
- Tables: `conversations`, `messages`, `message_folders`, `knowledge_base`, `messaging_persona`,
  `ai_providers`, `system_settings`, `system_alerts`, `webhook_events`. New: `message_tickets`,
  `ai_usage_log` (or columns on `messages`).

## 10. Open items to confirm during planning

- Exact knowledge_base tagging scheme per specialist.
- Cost telemetry shape: new `ai_usage_log` table vs columns on `messages`.
- Off-hours schedule definition (timezone, weekend days, holidays).
- Whether the router is a separate cheap model call or folded into the specialist call.
