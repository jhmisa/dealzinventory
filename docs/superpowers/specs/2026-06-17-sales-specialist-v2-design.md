# Sales Specialist v2 — Design

**Date:** 2026-06-17
**Status:** Draft for review (Approach A approved in brainstorm; Phase B / audio deferred)
**Branch:** `sales-specialist-v2-design`
**Builds on:** Plan 3b specialist playbooks (`messaging_specialists`), Plan 1 vision (`getLatestCustomerImages`)
**Related memory:** `project_sales_specialist_v2`, `project_messages_ai_redesign_progress`, `project_shop_url`, `feedback_consistent_descriptions`

---

## 1. Problem

The messaging AI's **Sales** specialist behaves wrong on broad category asks. Reported case:

> Customer: **"May laptop po ba kayo?"** ("Do you have laptops?")
> Bot: dumped a single random Fujitsu LifeBook with link, no qualifying.

That is the wrong move for a vague, underspecified request. The customer hasn't said who it's for, what it's for, or their budget — so a single cold product dump is unhelpful and feels robotic.

### Root cause

The behavior is **not** in the Sales playbook. It comes from a GLOBAL code constant, `INVENTORY_RESPONSE_RULE` in `supabase/functions/_shared/ai-providers.ts` (lines 91–98), appended to **every** messaging prompt via `buildEnhancedPrompt`:

```
2. If there are matches, lead your reply with 1-2 concrete options (model, grade, price, G-code)...
4. Do NOT ask multiple qualifying questions before showing inventory. Show what you have first.
```

This is **correct for a SPECIFIC ask** ("meron pa ba nung iPhone 13 128GB?") but **wrong for a BROAD ask** ("may laptop po ba kayo?"). It overrides the Sales playbook's instinct to qualify. The seeded Sales playbook (`messaging_specialists` slug='sales', migration `20260617130000_specialist_playbooks.sql` lines 34–39) actually already says *"If the request is vague, ask qualifying questions"* — but the global rule wins.

**Fixing/scoping that global rule is THE core fix.**

---

## 2. Scope

**In scope (Approach A — "Sales Specialist v2 brain"):**
- Rewrite the Sales playbook into a two-mode brain (specific vs. broad) with per-category tailored qualifying and budget-override intelligence.
- Scope the global `INVENTORY_RESPONSE_RULE` so "show first, don't qualify" only applies to specific asks.
- Add a per-item **order link** to the inventory context so the model can paste a real buy link.
- Conditional endpoint: draft concrete offers OR hand off a fully-qualified lead to a human.

**Out of scope (Phase B — DEFERRED):** audio voice-note delivery of the qualifying questions. Joey: *"it would be easy to integrate the audio later."* Not built now. Section 8 records the intent only.

---

## 3. Architecture (LOCKED)

**Playbook-driven brain + minimal enabling code. Single model call. The model self-classifies and self-routes** — consistent with Plan 3b. NOT a separate pre-classifier call.

- The model already classifies `product_inquiry` and routes into the Sales specialist.
- Within Sales, the **model self-routes** between Mode B (specific) and Mode A (broad) from the same single call — the routing instruction lives in the playbook text.
- Vision is already on (gpt-4o, `getLatestCustomerImages`) — no change needed to image flow.

So the change is: **(a)** rewrite the DB playbook row, **(b)** three small code/data edits in the edge functions. No new model calls, no new tables.

---

## 4. The two modes (model self-routes)

### Mode B — specific item
**Trigger:** customer has already decided — names a model / G-code / specs, or sends a screenshot of a listing, or asks "meron pa ba nito?" ("is this still available?").

**Behavior:**
1. Identify the item — via VISION find the G-code in the screenshot; else match specs + price against the `## Available Inventory` context.
2. If in stock → `"Opo, available pa po! Eto po yung link po..."` + **order link** (Section 6).
3. If gone → say so plainly, offer to find a similar item → slides into Mode A.
4. **No qualifying questions** — the customer already decided.

### Mode A — broad / underspecified
**Trigger:** a category-level or vague ask — "may laptop po ba kayo?", "may available ba kayong phone?", "ano meron kayo?".

**Behavior:** qualify FIRST (Section 5), then offer or hand off (Section 7).

### Defining broad vs. specific (for the model)
The playbook gives the model a heuristic, not a rigid rule:
- **Specific** = the message (or its attached image) pins down a single product or a tight set: a model name, a G-code, a screenshot of one listing, or specs precise enough that one or two SKUs match.
- **Broad** = only a category/intent is given ("laptop", "phone", "tablet", "ano meron"), with no recipient, use-case, or budget yet.
- When ambiguous, treat as **broad** and qualify — qualifying is the safer, friendlier default for Sales.

---

## 5. Mode A qualify-first behavior

**Delivery style = Joey's option #2:** reassure stock exists, then ask the top questions **bundled WARMLY into one friendly sentence** — NOT a checklist, never bombard. As the customer answers, **summarize the partial answers** ("confirm you listened"), ask the one remaining item, then offer/hand off.

**Per-category tailored questions** (Joey: "all devices, tailored"):

| Category | Question slots |
|---|---|
| **Laptops / computers** | (1) **para kanino** — recipient (anak, pamangkin, self) · (2) **saan gagamitin** — use-case (school / business / gaming) · (3) **ilang taon na ang gagamit** = the **USER'S AGE** (NOT laptop lifespan) · (4) **magkano budget** |
| **Phones** | budget · use · brand / storage |
| **Tablets** | budget · use |

> The laptop slot #3 is the user's age, corrected from an earlier "laptop lifespan" misread. It feeds tier selection (a 7-year-old vs. a college student need very different machines).

### Budget-override — THE key intelligence
Stated budget is a **starting point, not the answer.** Recipient + age + use-case determine the right device **TIER.** If the appropriate tier exceeds the stated budget, **recommend the right device anyway, with a reason** (a gentle, honest upsell) — and **route that to a human** (Section 7).

Examples Joey gave:
- Young child → tablet / entry device, even if they imagined a laptop.
- Highschool / college doing real schoolwork → a real laptop ¥25,000+ even if they said ¥15,000 — explain why the cheaper one won't serve them.

---

## 6. The order link (enabling change #2)

### Verified URL pattern
The canonical "buy now / order" link **staff already share** is **`/mine/{G-code}`**, not a `/shop/product/...` path. Evidence in the codebase:
- `src/components/messaging/inventory-search-modal.tsx:146` — staff inventory-share builds `📸 View & Order: {baseUrl}/mine/{sell_group_code}`.
- `src/pages/admin/sell-group-detail.tsx:92`, `src/pages/admin/items.tsx` (multiple) — same `/mine/{code}` share link.
- Route `/mine/:code?` → `MineClaimPage` (`src/routes.tsx:234`) resolves G-codes, item-codes, and accessory-codes.

> Other shop routes exist but are NOT the right link: `/shop/product/:id` takes a **product_model UUID** (not in AI context), and `/shop/checkout/:sellGroupId` / `/order/:sellGroupCode` jump straight to checkout. `/mine/{G-code}` is the "view photos + order" page staff hand out — using it keeps the AI link **consistent with what staff manually send** (`feedback_consistent_descriptions`).

### Implementation
The inventory context already carries the G-code but no URL. `formatContextForPrompt` in `supabase/functions/_shared/build-ai-context.ts:206` builds each `## Available Inventory` line as:

```
- {brand} {model_name} ({specs}) | Grade {grade} | {price} | {n} in stock | {sell_group_code}
```

Append the order link to each line so the model can paste it verbatim:

```
- {brand} {model_name} ({specs}) | Grade {grade} | {price} | {n} in stock | {sell_group_code} | Order: {SHOP_BASE}/mine/{sell_group_code}
```

**Base URL:** the frontend convention is `VITE_PUBLIC_SHOP_URL` (`inventory-search-modal.tsx:126`), which is a build-time Vite var **not readable by Deno edge functions.** So introduce a server-side secret read with `Deno.env.get('PUBLIC_SHOP_URL')` (set via `supabase secrets set`), falling back to the temporary `https://dealzinventory.vercel.app` (`project_shop_url` — temporary, changes when the real domain is ready). Strip any trailing `/shop` to match the frontend's normalization.

- The link is built **in code** (context formatter), not asked of the model — so the model can't hallucinate a URL.
- Do the same for the `## Available Items` block only if those rows carry a G-code; in the current shape they don't (they aggregate by model), so leave them link-less for now and note it.

---

## 7. Conditional endpoint (LOCKED — "conditional")

After qualifying (Mode A) or confirming (Mode B), the model picks ONE of two endings:

| Condition | Ending |
|---|---|
| Clear match within / near the stated need | **Draft 2 concrete offers** (model, grade, price, G-code, order link). Selling prices are PUBLIC and Phase-1 drafts are gated by staff review, so this is safe. |
| Budget-override upsell · high-value sale · no clean match | **Hand off to a human, WITH the need already summarized** so the human picks up a fully-qualified lead, not a cold start. |

**Handoff mechanism:** the model sets `escalation_reason` (reuses the Plan 3b `needs_human_review` path). Sales `always_escalate` stays **false** — only these specific conditions escalate, everything else still auto-drafts. The escalation note must contain the qualified summary (recipient, use-case, age, budget, recommended tier + why).

---

## 8. Phase B — audio (DEFERRED, not built now)

Record ONE warm human voice note that asks all four laptop questions, opening with an apology — *"sorry po madami akong tanong, gusto ko lang po mabigyan kayo ng magandang offer"* — plus a text-list fallback for non-players. Sent on broad-inquiry detection. Same brain as Phase A.

**Build only after** verifying send-rail audio-attachment support in `supabase/functions/send-message/index.ts` (Missive / Messenger). Recorded here for continuity; **no work in this spec.**

---

## 9. Enabling changes — summary

| # | Change | File | Note |
|---|---|---|---|
| 1 | **Scope `INVENTORY_RESPONSE_RULE`** so "show first / don't qualify" applies to SPECIFIC asks only (Mode B), not broad ones (Mode A). | `_shared/ai-providers.ts:91–98` | THE core fix. See decision in §10. |
| 2 | **Add per-item order link** `…/mine/{G-code}` to the inventory context line. | `_shared/build-ai-context.ts:206` (+ `Deno.env.get('PUBLIC_SHOP_URL')`) | Link built in code, not by the model. |
| 3 | **Rewrite the Sales playbook** into the two-mode brain (Modes A/B, per-category questions, budget-override, conditional endpoint). | DB row `messaging_specialists` slug='sales' (migration) | Self-routing lives here. |
| — | Vision images already flow | — | No change. |

---

## 10. Open design decisions to settle in planning

1. **Global-rule scoping mechanism (change #1)** — two options:
   - **(a) Make the global rule mode-aware:** rewrite `INVENTORY_RESPONSE_RULE` so it explicitly says "for a SPECIFIC ask, show 1–2 options first; for a BROAD/category ask, qualify first per the active specialist's playbook." Keeps one global rule, defers the broad-case detail to the playbook.
   - **(b) Soften the global rule** to only cover specific asks, and move ALL qualifying nuance into the Sales playbook.
   - **Recommendation:** (a) — the global rule stays the single source of the show-vs-ask decision and explicitly hands the broad case to the playbook; less risk of the two texts contradicting. Note this rule is shared by *all* specialists, so keep the edit category-neutral.

2. **Where the per-category question sets live** — inline in the Sales playbook text vs. KB articles tagged `'sales'`. Leaning **inline in the playbook** (one DB row, one place to edit, no retrieval dependency); the existing KB `'Handling Product Inquiries'` (tagged `sales`) can stay as supporting context.

3. **Exact wording** of the mode-routing instruction and the broad-vs-specific heuristic in the playbook (§4) — to be drafted in the plan.

4. **`## Available Items` block** (aggregated, no G-code) — confirm it stays link-less, or whether it should be dropped from Sales context to avoid the model linking the wrong thing.

---

## 11. Gotchas (from Plan 3b)

- Use the Supabase **CLI**, not the MCP (MCP needs interactive OAuth).
- Apply migrations via `supabase db push`.
- Branch off `main`.
- After merge: `supabase functions deploy generate-pending-drafts test-ai-reply`, then push (per `feedback_deploy_workflow`).
- Playbook change is a DB migration (UPDATE the `messaging_specialists` row) so it's reproducible, not a manual edit.

---

## 12. Success criteria

- "May laptop po ba kayo?" → the bot reassures stock exists and asks the laptop questions warmly in one sentence — does NOT dump a single cold product.
- "Meron pa ba nito?" + screenshot → bot identifies the item and replies with availability + a real `/mine/{G-code}` order link.
- A college-schoolwork ask with a ¥15,000 budget → bot recommends the right ¥25,000+ tier with a reason AND escalates to a human with the lead summarized.
- A clean in-budget match → bot drafts 2 concrete offers with order links (staff-gated).
- Every inventory line in the AI context carries a working `/mine/{G-code}` link.
