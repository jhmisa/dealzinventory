# Sales Specialist v2 — Design

**Date:** 2026-06-17
**Status:** Draft for review (reframed after Joey review — search-tool parity + qualify-then-handoff)
**Branch:** `sales-specialist-v2-design`
**Builds on:** Plan 3b specialist playbooks (`messaging_specialists`), Plan 1 vision (`getLatestCustomerImages`), the existing **Search Inventory** composer feature (`inventory-search-modal.tsx` + `searchAvailableInventory`)
**Related memory:** `project_sales_specialist_v2`, `project_messages_ai_redesign_progress`, `project_shop_url`, `feedback_consistent_descriptions`

---

## 1. Problem

The messaging AI's **Sales** specialist behaves wrong on broad category asks. Reported case:

> Customer: **"May laptop po ba kayo?"** ("Do you have laptops?")
> Bot: dumped a single random Fujitsu LifeBook with link, no qualifying.

That is the wrong move for a vague request — the customer hasn't said who it's for, what for, or their budget, so a cold single-product dump is unhelpful and robotic.

### Root cause
The behavior is **not** in the Sales playbook. It comes from a GLOBAL constant, `INVENTORY_RESPONSE_RULE` in `supabase/functions/_shared/ai-providers.ts` (lines 91–98), appended to **every** messaging prompt via `buildEnhancedPrompt`:

```
2. If there are matches, lead your reply with 1-2 concrete options...
4. Do NOT ask multiple qualifying questions before showing inventory. Show what you have first.
```

Correct for a SPECIFIC ask, wrong for a BROAD ask. It overrides the Sales playbook's instinct to qualify (the seeded playbook already says "if vague, ask qualifying questions" — but the global rule wins). **Scoping that rule is part of the fix.**

---

## 2. What the human agent actually does (the model to copy)

Two real behaviors, from Joey's screenshots:

**A — Broad ask** ("may laptop po ba kayo?"): a good agent doesn't dump a product. They ask who it's for, what for, and the budget — then a human applies judgment about the right device.

**B — Specific availability confirmation** ("Meron pa po kayo ganyan" + an image of an item): the agent
1. **reads the item** from the image (the screenshot showed a live-sell overlay stamped `P000825 … ¥7,900 … Iris Ohyama LUCA Tablet TM101`),
2. **searches live inventory** for the matching *available* listing — and the answer was a **different code**, `G000022` (the in-stock sell group for that same model; the P-code unit from the video was gone),
3. **sends the offer** via the **Search Inventory** composer tool — code + description + grade + price + `📸 View & Order: …/mine/G000022` + the product photo — then "last 1 po, mine na po kayo."

The whole design is: **let the AI do exactly this, reusing the existing Search Inventory feature — and hand the judgment cases to a human.**

---

## 3. Scope

**In scope:**
- **Path 1 (broad/underspecified):** AI **gathers context** (qualifies warmly) and **hands a fully-qualified lead to a human**. The AI does NOT pick or draft the offer.
- **Path 2 (specific availability confirmation):** AI **identifies the item** (vision/text), **searches live inventory via a tool** (same search the human uses), and **if found, makes the offer itself** by reusing the existing inventory-insert pipeline (photo + `/mine/{code}` link). If gone / not found → say so and hand to a human.
- **Scope `INVENTORY_RESPONSE_RULE`** so broad asks qualify-then-handoff and specific asks search-then-confirm.

**Out of scope (Phase B — DEFERRED):** audio voice-note delivery of the qualifying questions. Joey: *"it would be easy to integrate the audio later."* §9 records intent only.

**Explicitly NOT doing** (dropped after review): hand-building `/mine` link strings inside the prompt context formatter, and stuffing P-codes into the prompt for the model to match against. Both are replaced by the **search tool + existing render pipeline** — we reuse the Search Inventory feature instead of recreating it.

---

## 4. Architecture

**Reuse the existing Search Inventory feature; add a tool so the AI can call it; keep the human in the loop.** Concretely:

1. **Tool-use / function-calling** is added to the messaging AI call: a `search_inventory` tool whose implementation runs the **same query the modal uses** (`searchAvailableInventory`). True parity — the AI searches all live inventory exactly like Kay did, finding the available listing even when it's a different code (P000825 → G000022). *(This is a real departure from the old "single completion" flow — see §6.)*
2. **The offer is rendered by the existing inventory-insert pipeline** — photo + formatted text + `/mine/{code}` link — NOT reinvented. The AI's job is to choose *which* result code(s) to offer; the render reuses one shared code path (§7).
3. **Path 1 (broad)** never offers — it qualifies and escalates with a summary, reusing the Plan 3b `needs_human_review` / `escalation_reason` mechanism.
4. **Vision already flows** (gpt-4o, `getLatestCustomerImages`) — no change.

The Sales playbook (`messaging_specialists` slug='sales') is rewritten to drive this two-path behavior and to decide when to call the tool, when to offer, and when to hand off. Self-routing stays in the playbook; the model still self-classifies `product_inquiry`.

---

## 5. The two paths (model self-routes)

### Path 1 — Broad / underspecified → qualify, then hand to human
**Trigger:** category-level or vague ask with no recipient/use/budget — "may laptop po ba kayo?", "may phone ba kayo?", "ano meron kayo?".

**Behavior:**
1. **Reassure stock exists, then ask the top questions bundled WARMLY into one friendly sentence** — NOT a checklist, never bombard (Joey's option #2). As the customer answers, **summarize the partial answers** ("confirm you listened"), ask the remaining one.
2. **Per-category tailored questions** (Joey: "all devices, tailored"):

   | Category | Question slots |
   |---|---|
   | **Laptops / computers** | (1) **para kanino** — recipient (anak, pamangkin, self) · (2) **saan gagamitin** — use-case (school / business / gaming) · (3) **ilang taon na ang gagamit** = the **USER'S AGE** (not laptop lifespan) · (4) **magkano budget** |
   | **Phones** | budget · use · brand / storage |
   | **Tablets** | budget · use |

3. **Hand to a human with the lead fully summarized** — recipient, use-case, age, budget, and any budget-vs-tier note (below). The human decides what to offer. The value: the human picks up a warm, qualified lead instead of a cold start.

**Budget context (informs the handoff note, not an AI offer):** stated budget is a starting point, not the answer. Recipient + age + use determine the right TIER; if the right tier exceeds the stated budget, the AI **notes that in the handoff** (e.g. "budget ¥15k but it's for a college student doing schoolwork → realistically needs a ¥25k+ laptop"). The human makes the upsell call. Examples: young child → tablet/entry; highschool/college schoolwork → real laptop ¥25k+.

> Path 1 deliberately does NOT auto-draft offers. Recommending the right device across budget tiers is a judgment call → human.

### Path 2 — Specific availability confirmation → identify, search, offer
**Trigger:** customer has decided and is checking availability — "meron pa po kayo nito/ganyan?", names a model / P-code / G-code / specs, or sends a screenshot of a listing.

**Behavior:**
1. **Identify the item** — via VISION read the code/model/specs/price from the image (often a live-sell overlay with a P-code), or from the text.
2. **Call `search_inventory`** with what was identified (code, or model + specs). This runs the same search the human's modal runs, across ALL live inventory.
3. **If an available match is found** → **make the offer**: reuse the inventory-insert pipeline to send code + description + grade + price + `📸 …/mine/{code}` + photo — exactly the human's format. Use whatever code the search returns as available (may differ from what the customer referenced — P000825 → G000022).
4. **If gone / no available match** → say so plainly ("pasensya po, nabenta na po yung ganyan"), offer to find similar, and hand to a human (slides toward Path 1).
5. **No qualifying questions** — the customer already decided.

### Defining broad vs. specific (for the model)
Heuristic, not a rigid rule:
- **Specific** = the message or its image pins down a product — a model name, a code, a screenshot of one listing, or specs tight enough that the search returns a clear match.
- **Broad** = only a category/intent ("laptop", "phone", "ano meron"), no recipient/use/budget.
- When ambiguous → treat as **broad** and qualify (the safer, friendlier default).

---

## 6. The `search_inventory` tool (enabling change #1)

### Why a tool (true parity, Joey's choice)
The human searched ALL live inventory and found the right available code — not whatever the customer happened to quote. To match that, the AI needs the same search, not a truncated in-prompt list. So the model gets a **function-calling tool** it invokes after identifying the item.

### Tool contract (draft)
```
search_inventory(query: string, category?: string, brand?: string, price_min?: number, price_max?: number)
  → [{ type: 'item'|'sell_group'|'accessory', code, description, grade, price, thumbnail_url, display_url, available }]
```
Mirrors the modal's `InventorySearchFilters` + `AvailableInventoryResult` (`src/services/items.ts:424,439`).

### Implementation reality (the real work)
- **Current flow is a single completion.** `generateAIReply` (`ai-providers.ts:116`) sends one request and parses one JSON reply — **no tool-calling loop today.** Adding tool-use means: send tools → if the model returns a tool call, execute it server-side → feed the result back → get the final reply. This must be built for the **active provider** (per `project_ai_provider_config_split`: OpenRouter / openai / `gpt-4o`, vision on). Other providers fall back to no-tool (Path 1 qualify+handoff still works; Path 2 degrades to "hand to human to check").
- **The search runs server-side (Deno edge function).** `searchAvailableInventory` is **client-side** today (`src/services/items.ts`, browser supabase client). To call identical logic from the edge tool, extract the query into a **Supabase RPC** (`search_available_inventory`) callable from BOTH the browser service and the edge tool — one source of truth, no duplicated query logic across runtimes. *(RPC vs. porting the TS into a shared Deno module is §10.1.)*

---

## 7. Rendering the offer — reuse the Search Inventory pipeline (enabling change #2)

The offer message must look exactly like the human's (screenshot): code + description + grade + price + `📸 View & Order: {SHOP_BASE}/mine/{code}` + the product photo. This is already built — `inventory-search-modal.tsx:94–155` (`handleAdd` → format text + `uploadAttachment` photo → `onInsertItem`). **Do not reinvent it.**

- The AI emits the chosen **offer code(s)** (from the `search_inventory` results) in its structured output.
- Those codes are expanded through the **same render path the "+ Add" button uses** — producing the formatted text + `/mine/{code}` link + attached photo.
- **Base URL:** the frontend uses `VITE_PUBLIC_SHOP_URL` (`inventory-search-modal.tsx:126`), a build-time Vite var not readable by Deno. If any rendering happens server-side, read `Deno.env.get('PUBLIC_SHOP_URL')` (set via `supabase secrets set`), default to the temporary `https://dealzinventory.vercel.app` (`project_shop_url`), strip trailing `/shop`. The link string is built in code, never by the model — so it can't hallucinate a URL or code.

**Open (§10.2):** *where* the expansion happens — (a) **frontend auto-expand** when the draft loads for staff review (reuses 100% of the modal pipeline incl. photo; staff still review/send), or (b) **server-side render** so the draft is stored already-formatted with the photo attached (`messages` rows support attachments — `send-message` base64s them into Missive; the draft insert just doesn't populate one today). Phase 1 drafts are always staff-reviewed, so (a) is the lighter, lower-risk default.

---

## 8. Endpoint summary

| Situation | Ending |
|---|---|
| **Broad ask** | Qualify warmly → **hand to human** with recipient/use/age/budget + budget-vs-tier note. No AI offer. |
| **Specific confirm, match available** | **AI makes the offer** (photo + `/mine/{code}`) via the reused pipeline. Staff-gated draft. |
| **Specific confirm, gone / not found** | Say so, offer to find similar, **hand to human**. |

**Handoff mechanism:** model sets `escalation_reason` (reuses Plan 3b `needs_human_review`, `ai-providers.ts:25`, parsed line 412). Sales `always_escalate` stays **false** — only these cases escalate; specific-confirm matches still auto-draft the offer. The escalation note carries the qualified summary.

---

## 9. Phase B — audio (DEFERRED, not built now)

Record ONE warm human voice note asking the four laptop questions, opening with an apology — *"sorry po madami akong tanong, gusto ko lang po mabigyan kayo ng magandang offer"* — plus a text-list fallback. Sent on broad-inquiry detection. Same brain as Path 1. **Build only after** verifying send-rail audio-attachment support in `send-message/index.ts`. Recorded for continuity; no work here.

---

## 10. Open design decisions to settle in planning

1. **Search reuse mechanism (change #1):** Supabase **RPC** `search_available_inventory` (one source of truth, callable from browser + edge) **vs.** porting `searchAvailableInventory` into a shared Deno module. Leaning **RPC** — the search spans `items` + `sell_groups` + media joins; an RPC avoids maintaining the same multi-table query in two runtimes, and the browser modal can adopt it too.
2. **Offer render location (change #2):** frontend auto-expand at staff review **vs.** server-side render into a draft-with-attachment (§7). Leaning **frontend auto-expand** (lighter, reuses the modal pipeline wholesale, photo included; staff always review in Phase 1).
3. **Tool-use loop scope:** implement function-calling for the active provider only (openai/openrouter); define the graceful fallback for non-tool providers (Path 1 works; Path 2 → "hand to human to check stock"). Confirm `gpt-4o` via OpenRouter supports the tool-call + vision combo in one turn.
4. **`INVENTORY_RESPONSE_RULE` scoping:** (a) make it mode-aware ("specific → show/search first; broad → qualify per the active playbook") **vs.** (b) soften it and move all nuance into the Sales playbook. Leaning **(a)** — keeps one global show-vs-ask rule; note it's shared by all specialists, so keep the edit category-neutral.
5. **Where the per-category question sets live:** inline in the Sales playbook text vs. KB articles tagged `'sales'`. Leaning **inline** (one DB row, no retrieval dependency); existing KB `'Handling Product Inquiries'` stays as supporting context.
6. **Identify-from-image robustness:** the easy case is a live-sell overlay with a printed P-code/model (vision reads it). Define fallback when the customer sends a raw device photo with no code — search by vision-extracted model/specs, and if the search is ambiguous, confirm with one short question before offering.
7. **`how-many-results` / tool-call budget:** cap results returned to the model; decide max tool calls per turn to bound cost/latency.

---

## 11. Enabling changes — summary

| # | Change | Where | Note |
|---|---|---|---|
| 1 | **Add `search_inventory` tool** (function-calling loop) running the same search as the modal, via a shared **RPC**. | `_shared/ai-providers.ts` (tool loop), new migration (RPC), `src/services/items.ts` (adopt RPC) | True parity. New flow shape — see §6. |
| 2 | **Render offers via the existing inventory-insert pipeline** (photo + `/mine/{code}`); AI emits chosen code(s). | `inventory-search-modal.tsx` pipeline reused (frontend auto-expand) or shared formatter | Do NOT reinvent formatting/links/photo. |
| 3 | **Scope `INVENTORY_RESPONSE_RULE`** — broad → qualify+handoff, specific → search+confirm. | `_shared/ai-providers.ts:91–98` | Part of the behavioral fix. |
| 4 | **Rewrite the Sales playbook** — two-path brain, per-category questions, tool-call + offer vs. handoff rules, budget-vs-tier handoff note. | DB row `messaging_specialists` slug='sales' (migration) | Self-routing lives here. |
| — | Vision images already flow | — | No change. |

---

## 12. Gotchas (from Plan 3b)

- Use the Supabase **CLI**, not the MCP (MCP needs interactive OAuth); migrations via `supabase db push`.
- Branch off `main`.
- After merge: `supabase functions deploy generate-pending-drafts test-ai-reply`, then push (`feedback_deploy_workflow`).
- Playbook + RPC changes are DB migrations (reproducible), not manual edits.

---

## 13. Success criteria

- **Broad:** "May laptop po ba kayo?" → bot reassures stock exists, asks the laptop questions warmly in one sentence, and (once answered) hands a summarized lead to a human — never dumps a cold product, never auto-offers.
- **Specific match (the screenshot case):** "Meron pa po kayo ganyan" + image of the LUCA tablet → bot reads the item, calls `search_inventory`, finds the available `G000022`, and offers it with photo + `/mine/G000022` link — even though the image showed `P000825`.
- **Specific, gone:** referenced item sold out → bot says so, offers to find similar, hands to a human.
- **Parity:** the AI's offer message is visually identical to what the human produces via Search Inventory (same format, link, photo) — because it reuses that pipeline.
- **Budget-vs-tier:** ¥15k budget for college schoolwork → handoff note flags the realistic ¥25k+ tier; the human, not the AI, makes the upsell.
