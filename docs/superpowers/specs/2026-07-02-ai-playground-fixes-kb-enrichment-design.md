# Design — AI Playground Fixes + Attachment→KB Enrichment

**Date:** 2026-07-02
**Branch:** `feat/canned-responses-ai-consolidation`
**Author:** Joey + Claude
**Status:** Approved design → ready for implementation plan

## Context

While testing the messaging AI in the Test Playground, Joey found three problems:

1. **The AI couldn't quote Philippines delivery rates.** It gave a vague "depende sa timbang, mag-submit ng request" answer. Root cause: the PH pricelist exists **only as pixels inside an image attachment** (`Express Service Information.png`) on the `Info: Express Service` template. The AI reads text, not images, so it never had the numbers. This generalizes: **6 templates carry image attachments whose factual content is invisible to the AI.**
2. **Markdown leaked into a reply** (`**Oppo A54 5G**`, `[Order here!](url)`). Investigation showed production already strips markdown (`normalizeOutboundText()` runs twice on real sends) — the leak is **only in the Test Playground**, which never calls the normalizer. Separately the model hand-wrote a markdown suggestion list instead of using the clean `{{OFFER:CODE}}` token path.
3. **Canned responses are hard to find** — the admin list is a flat alphabetical `templates.map()` with no search or filter. At ~200 entries this is unusable.

A 4th issue surfaced during investigation: **template attachments won't preview in the admin UI** (Joey couldn't open the pricelist to screenshot it). The signed-URL request fails when the filename contains a space unless the storage path is URL-encoded.

## How facts currently flow into the AI (verified)

- **Tables:** `messaging_templates` (canned replies: `content_en`, `specialist_slug`, `sub_intent_slug`, `ai_usage ∈ {AUTO,DRAFT,REFERENCE,OFF}`, `attachments jsonb`), `knowledge_base` (`entry_type ∈ {knowledge,guardrail}`, `content`, `category`, `specialist_tags text[]`), `messaging_specialists` (per-topic playbooks).
- **Prompt assembly:** `supabase/functions/_shared/build-specialist-prompt.ts` → `buildSpecialistSystemPrompt()` orders: Guardrails → Persona → per-specialist (playbook + KB articles tagged for that specialist via `specialist_tags` + Approved Replies where `ai_usage != 'OFF'`) → General Knowledge (untagged articles).
- **DB loader:** `supabase/functions/_shared/generate-draft.ts` loads `knowledge_base` where `is_active`, `messaging_templates` where `is_active AND ai_usage != 'OFF'`, and specialists.
- **Key implication:** adding a `knowledge_base` article with the right `specialist_tags` makes the AI read it **with zero code change**. This is the delivery mechanism for the attachment content.

## Scope

Four workstreams. 1 and 2 are the core value; 3 and 4 are quality-of-life fixes bundled in.

---

### WS1 — Attachment → Knowledge Base enrichment (data / migration)

Convert the factual content of all 6 image attachments into AI-readable `knowledge_base` articles. Templates and their image attachments are **left untouched** — they still auto-send the polished visuals; the KB articles give the AI the *text* so it can answer questions conversationally.

Delivered as a single Supabase migration (applied via CLI). Each article: `entry_type='knowledge'`, `is_active=true`, `category` set sensibly, `specialist_tags` as noted. Use `INSERT ... ON CONFLICT (title) DO UPDATE` (or delete-by-title then insert) so re-runs are idempotent and don't duplicate.

**Articles to create:**

1. **"Philippines Express Shipping Rates"** — tags: `sales`, `order_tracking`
   ```
   Philippines Express Shipping (Japan → PH). All-inclusive — receiver pays nothing extra. Max 2 gadgets per order. Door-to-door; far/remote areas pick up at nearest LBC branch/warehouse.
   Rates:
   - Mobile phone, 1–2 units, NO box: ¥1,900
   - Mobile phone, 1–2 units, WITH box: ¥2,800
   - 1 phone + 1 tablet: ¥4,800
   - Tablet, 1 or 2 units: ¥4,800
   - Laptop 10–16", 1 unit: ¥4,800
   - 2 laptops, or 1 gaming laptop: ¥7,800
   - 1 laptop + 1 phone/tablet: ¥4,800
   Lead time (after payment confirmed): Metro Manila & Luzon 3 weeks; Visayas & Mindanao 4 weeks.
   Payment recommendation for PH-bound orders (depends on where the payer is):
   - Paying FROM Japan → recommend SmartPit. Pays: item price + international shipping fee.
   - Paying FROM the Philippines → recommend PayPal (Debit/Credit). Pays: item price + shipping + PayPal fee (5% if ¥10,000 or more, 10% if below ¥10,000).
   ```

2. **"How to Pay via PayPal"** — tags: `order_tracking`
   ```
   PayPal payment steps (for PH-side payers): 1) Open the PayPal link we send. 2) Verify the company name shown is "Yehey Japan Kabushiki Kaisha (株式会社イーエーヘイ・ジャパン)". 3) Enter the payment amount in Japanese Yen exactly as on the invoice we sent — triple-check to avoid errors/extra charges. 4) Enter the Order Number (format YJ-XXXXXX). 5) If you have a PayPal account, tap "PayPal"; if not, tap "Debit or Credit Card" and enter card number, expiry, CVV. 6) Choose to be charged in PHP or JPY (JPY uses your bank's conversion rate). 7) Enter name, address, mobile number, email. 8) Agree to the PayPal agreement & Privacy Statement, then tap Pay. 9) Screenshot the confirmation screen and keep it until the transaction is completed.
   ```

3. **"How to Pay via SmartPit"** — tags: `order_tracking`
   ```
   SmartPit payment (at a Japanese konbini). Go to the nearest Lawson/Ministop (Loppi machine) or FamilyMart (multi-copy machine).
   Lawson/Ministop (Loppi): 1) Tap "Various ID Numbers". 2) Enter the SmartPit Number, tap Next. 3) Select "SmartPit Payment". 4) Select the amount to be paid, tap Next. 5) Review details, tap Confirm. 6) Bring the printed payment slip to the cashier.
   FamilyMart (multi-copy): 1) Tap "FaMiMa/Edy/WAON/SmartPit". 2) Select "SmartPit". 3) Enter the SmartPit Number, tap OK. 4) Select the amount, tap OK. 5) Review, tap OK. 6) Bring the payment slip to the cashier.
   A receipt prints after paying at the cashier. Send a photo of the receipt to customer support for processing.
   ```

4. **"Order Redelivery (Yamato)"** — tags: `order_tracking`, `aftersales`
   ```
   Requesting redelivery of a missed Yamato delivery: 1) Find the attempted-delivery notice (ご不在連絡票) in your mailbox; redelivery info is on the back. 2) Note the delivery attempt date and your tracking number. 3) If you speak Japanese, call the driver directly using the number on the notice, give your tracking number, and coordinate redelivery. If you prefer English, call Yamato's automated phone service, provide your tracking number, and follow the voice prompts. 4) Wait for redelivery on your requested schedule.
   ```

5. **"Condition Ranking & Warranty"** — tags: `sales`, `aftersales`
   ```
   Condition ranks (always describe S as "New" to the customer): S = New (open box, never used) — pristine factory condition; A = Very good — almost no scratches or signs of wear; B = Good — some scratches/signs of wear; C/D = Fair — noticeable scratches/signs of wear.
   Warranty: New / Rank S = 3 months (7-day replacement + 2 months 3 weeks service warranty). Refurbished (Rank A/B/C/D) = 1 month (7-day replacement + 3 weeks service warranty). Accessories = 7-day replacement.
   Replacement warranty covers factory defects (battery, screen, buttons, camera, speakers, ports). Service warranty covers device mishandling and factory defects unreported within 7 days. Claims require the unit and all inclusions returned in good condition as received.
   ```
   > Note: S must be communicated as "New" (open-box, never used) to avoid confusing customers who read a bare "S".

6. **"Special Order Request"** — tags: `sales`
   ```
   Special / out-of-stock order process: 1) Make a non-refundable downpayment (paid via SmartPit) so we order the requested unit. 2) Wait 5–7 days for it to arrive at our Tokyo warehouse. 3) Finalize details; delivery in 1–3 days after arrival.
   Balance = Unit Price − downpayment + ¥1,000 standard shipping fee (except far areas). Final balance payable by COD, Credit Card (+4%), or SmartPit.
   ```

**Reconciliation:** these are additive and consistent with the existing `Shipping Information` and `Payment Methods` KB articles (rewritten in the prior consolidation). No guardrails change. If any new article duplicates an existing one by title, upsert wins.

---

### WS2 — Markdown fix + clean multi-item offers (edge functions)

**Part A — Playground parity (the actual leak).** `supabase/functions/test-ai-reply/index.ts` builds `finalReply = assembleOfferReply(...)` (~line 203) but never normalizes. Production (`generate-draft.ts:309`) wraps the same in `normalizeOutboundText()`. Fix: import `normalizeOutboundText` from `_shared/normalize-markdown.ts` and wrap the playground's `finalReply` so the Playground shows exactly what a customer receives.

**Part B — Clean multi-item suggestions.** The offer instruction (`_shared/ai-providers.ts`, `INVENTORY_RESPONSE_RULE`) says prefer ONE item and use `{{OFFER:CODE}}` tokens. Add an explicit rule: when offering **multiple** items, emit **one `{{OFFER:CODE}}` token per item, each on its own line** — never a hand-written markdown list with `**bold**` or `[label](url)`. This makes multi-suggestions render as clean emoji offer blocks with photos. `normalizeOutboundText` remains the deterministic safety net.

**Deploy:** `test-ai-reply`, `generate-pending-drafts`, `missive-webhook` (any function bundling the changed `_shared` files) redeployed via CLI.

---

### WS3 — Canned responses findability (frontend)

In `src/pages/admin/messaging-settings.tsx`, the "Canned Responses (Approved Replies)" card (lines ~1366–1438). Add, inside `<CardContent>` above the list:

- **Search box** — filters by `name` + `content_en` (+ `content_ja`), case-insensitive, via a `useMemo` (mirror `src/components/messaging/canned-responses-panel.tsx` lines 43–57).
- **Collapsible category groups** — group the (filtered) templates by `specialist_slug`, with an "Uncategorized / Global" bucket for `null`. Each group is a collapsible section (shadcn `Collapsible` / `Accordion`) with a header showing the group label + count. Searching auto-expands groups with matches. Group labels come from `useSpecialists()` (already imported on the page).

Frontend-only. No schema/service change (existing `getTemplates()` returns all rows).

---

### WS4 — Attachment preview bug (frontend, small)

Template attachments stored in the private `messaging-attachments` bucket fail to load when the filename contains a space, because the signed-URL request path isn't URL-encoded. Locate where the admin/template UI builds the signed URL for attachment preview/download (service or component) and ensure the object path is `encodeURIComponent`-safe (encode path segments, or use the supabase-js `createSignedUrl` which handles this). Verify by previewing `Express Service Information.png` in the UI.

> If investigation shows the app already uses `supabase.storage.from().createSignedUrl()` (which encodes internally) and the failure is elsewhere, adjust the fix to the real cause found. The observable acceptance test is unchanged: the pricelist attachment previews in the admin UI.

## Out of scope (YAGNI)

- A dedicated structured "Company Info" table — deferred; KB articles cover the need now.
- Changing template auto-send behavior or the images themselves.
- Reworking the offer-token rendering engine.
- Editing KB articles from the UI beyond what already exists.

## Acceptance criteria

- AI answers "magkano ang shipping sa laptop papuntang Pilipinas?" with **¥4,800**, and recommends SmartPit (JP payer) / PayPal (PH payer).
- AI can explain PayPal steps, SmartPit steps, redelivery, condition ranks (S described as "New"), warranty periods, and special-order flow from KB text.
- Test Playground output contains no `**` or `[...](...)`; multi-item suggestions render as stacked `{{OFFER:CODE}}` blocks with photos.
- Canned Responses admin list has a working search and collapsible category groups.
- `Express Service Information.png` (and other space-named attachments) preview in the admin UI.

## Testing

- **WS1:** unit-style check that the migration inserts 6 articles; spot-check the assembled system prompt (or Playground reply) quotes ¥4,800 for a PH laptop. Existing `_shared/*.test.ts` should still pass.
- **WS2:** add/extend a test around `normalizeOutboundText` usage in the playground path; manual Playground run for the Oppo multi-suggestion case.
- **WS3:** manual — search filters, groups collapse/expand, count badges correct, "Global" bucket present.
- **WS4:** manual — attachment with a space in its name opens.
