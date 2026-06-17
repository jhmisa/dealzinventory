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
**Trigger:** customer has already decided — names a model / P-code / G-code / specs, or sends a screenshot of a listing, or asks "meron pa ba nito?" ("is this still available?").

**Behavior:**
1. Identify the item — via VISION read the code in the screenshot (often a **P-code**, since staff share individual units that way); else match specs + price against the inventory context. Resolve to the specific unit (P-code) when the customer referenced one, otherwise the pooled group (G-code) — see §6 "Which code to link".
2. If in stock → `"Opo, available pa po! Eto po yung link po..."` + **order link** at the matching granularity (Section 6).
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
The canonical "buy now / order" link **staff already share** is **`/mine/{code}`**, NOT a `/shop/product/...` path. Crucially, `/mine/:code?` resolves **both** code types — and staff use both:
- **`/mine/{P-code}`** — an individual physical unit. `src/pages/admin/items.tsx:1044,1334` share this for single items.
- **`/mine/{G-code}`** — a sell group (a pool of interchangeable units). `inventory-search-modal.tsx:146`, `sell-group-detail.tsx:92`, `items.tsx:941` share this.
- Route `/mine/:code?` → `MineClaimPage` (`src/routes.tsx:234`) resolves P-codes, G-codes, and accessory-codes.

> Other shop routes exist but are NOT the right link: `/shop/product/:id` takes a **product_model UUID** (not in AI context), and `/shop/checkout/:sellGroupId` / `/order/:sellGroupCode` jump straight to checkout. `/mine/{code}` is the "view photos + order" page staff hand out — using it keeps the AI link **consistent with what staff manually send** (`feedback_consistent_descriptions`).

### Which code to link — P-code vs G-code
This is the key distinction (raised in review):
- **G-code = a pool of interchangeable physical units** (same config + grade + price; `stock_count` can be >1). When the customer's ask matches a pooled listing, link the **G-code** — the order reserves one unit from the pool. This is correct for typical "do you have an iPhone 13 128GB Grade A?" style matches.
- **P-code = one specific physical unit.** When the customer references an *individual* item — a screenshot of a P-code listing staff previously sent, a unique unit with its own condition notes/photos, or a single-stock item — link the **P-code** so they land on that exact unit.

The model links the code that matches **what the customer actually referenced**. Mode B (screenshot / "meron pa ba nito?") most often needs the **P-code** path, because staff frequently share individual units by P-code.

### The gap this exposes (and the real fix)
The AI inventory context **today exposes only G-codes** — it has no P-codes at all:
- `getInventorySummary` → `## Available Inventory` (`build-ai-context.ts:334`): queries `sell_groups`, returns `sell_group_code`; member units are collapsed into a `stock_count` only. **No `item_code`.**
- `getAvailableItemsSummary` → `## Available Items` (`build-ai-context.ts:397`): queries `items` but aggregates by brand+model and never selects `item_code`. **No `item_code`.**

So as written, the AI literally *cannot* produce a P-code link or match a specific unit. **Enabling change #2 must therefore surface `item_code` (P-codes), not just append a URL.** Concretely:

1. **`## Available Inventory` (sell groups):** add each group's member `item_code`s. Extend the `getInventorySummary` select to pull `sell_group_items(items(item_code, ...))` (it already joins `items`), and render the group's order link as the **G-code** link plus, where the group is a single specific unit, the member **P-code**. Line shape becomes roughly:
   ```
   - {brand} {model_name} ({specs}) | Grade {grade} | {price} | {n} in stock | {sell_group_code} | Units: {P-code, …} | Order: {SHOP_BASE}/mine/{sell_group_code}
   ```
2. **`## Available Items` (individual units):** add `item_code` to the select and stop collapsing identity away, OR add a per-unit line carrying its P-code and `Order: {SHOP_BASE}/mine/{item_code}`. Exact shape is an open decision (§10.5) — but the block must carry P-codes so individual units are linkable.
3. The model picks G-code vs P-code per §"Which code to link"; the **link string itself is built in code** (context formatter), never asked of the model, so it can't hallucinate a URL or a code.

**Base URL:** the frontend convention is `VITE_PUBLIC_SHOP_URL` (`inventory-search-modal.tsx:126`), a build-time Vite var **not readable by Deno edge functions.** Introduce a server-side secret read with `Deno.env.get('PUBLIC_SHOP_URL')` (set via `supabase secrets set`), falling back to the temporary `https://dealzinventory.vercel.app` (`project_shop_url` — temporary, changes when the real domain is ready). Strip any trailing `/shop` to match the frontend's normalization.

---

## 7. Conditional endpoint (LOCKED — "conditional")

After qualifying (Mode A) or confirming (Mode B), the model picks ONE of two endings:

| Condition | Ending |
|---|---|
| Clear match within / near the stated need | **Draft 2 concrete offers** (model, grade, price, the code — G-code for a pooled listing or P-code for a specific unit — and the matching `/mine/{code}` order link). Selling prices are PUBLIC and Phase-1 drafts are gated by staff review, so this is safe. |
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
| 2 | **Surface P-codes AND add order links** to the inventory context: extend `getInventorySummary` / `getAvailableItemsSummary` to carry `item_code` (P-codes) alongside `sell_group_code` (G-codes), then render `/mine/{code}` links at the right granularity. | `_shared/build-ai-context.ts:206,334,397` (+ `Deno.env.get('PUBLIC_SHOP_URL')`) | Context today has **no P-codes** — bigger than a URL append. Link built in code, not by the model. |
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

4. **`## Available Items` block** (currently aggregated by model, no code at all) — decide whether to (a) add per-unit lines carrying `item_code` + a `/mine/{P-code}` link, or (b) drop the block from Sales context entirely to avoid the model linking an un-codeable aggregate. Leaning (a) since individual units are exactly the P-code case.

5. **P-code surfacing shape (change #2)** — exact line format once `item_code`s are added to the context: do sell-group lines list all member P-codes, or only when stock=1? How many P-codes per group before truncating? Keep the context compact (it's prompt budget) while still letting the model match a referenced unit.

6. **P-code vs G-code link rule wording** — the playbook instruction telling the model when to link the specific P-code vs the pooled G-code (§6 "Which code to link"). Draft in the plan.

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
- "Meron pa ba nito?" + screenshot of a P-code listing → bot identifies the **specific unit** and replies with availability + a real `/mine/{P-code}` order link (not just the group).
- A pooled "do you have an iPhone 13 128GB Grade A?" match → bot links the `/mine/{G-code}` (reserves one from the pool).
- A college-schoolwork ask with a ¥15,000 budget → bot recommends the right ¥25,000+ tier with a reason AND escalates to a human with the lead summarized.
- A clean in-budget match → bot drafts 2 concrete offers with the correct code + order link (staff-gated).
- The AI inventory context carries **both** G-codes and member P-codes, and every offered line has a working `/mine/{code}` link pointing at the right granularity.
