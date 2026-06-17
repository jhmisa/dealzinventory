# AI Offer Reply Formatting — Design

**Date:** 2026-06-18
**Status:** Approved (design), pending implementation plan

## Problem

When the messaging AI confirms a specific product is available, it free-forms the
entire reply text — including the product spec block and the order link. Because
models format inconsistently, the customer receives:

- Raw markdown that Facebook Messenger does **not** render — e.g. `- **Price:** ¥18,900`
  shows literal asterisks.
- A markdown link `[Order here](https://.../mine/P001443)` whose label/bracket syntax
  shows as raw characters (the bare URL inside is still auto-linked, but the wrapper is ugly).
- A spec line that is only `brand + model` (e.g. "Oppo A5 5G"), not the full canonical
  spec string the human agents paste from the Messages tab.

We want AI offer replies to match what agents send manually:

```
Yes, available pa po ang Oppo A5 5G in Aurora Green! Meron po tayong 1 in stock! 😊

🏷 P001443
📝 Oppo A5 5G 4GB 128GB Aurora Green Android 14
🏅 Rank S
💴 ¥18,900
📸 Buy Now & View Photos: https://dealzinventory.vercel.app/mine/P001443

If you have any questions or need help ordering, let me know po!
```

…plus the product photo attached below (already works), a bare clickable link, and
**zero markdown**.

## Decisions (locked)

1. **Code-assembled block**, not prompt-only. The AI writes only the natural intro and
   outro lines; our code deterministically builds the emoji spec block from structured
   inventory data. Guarantees identical format, a clean clickable link, and accurate
   code/grade/price/link with no hallucination.
2. **Full specs now**. The 📝 line uses the same canonical, category-aware description
   the manual agent paste uses — not just brand + model.

## Current architecture (as-is)

- The reply text — spec block and link included — is entirely model-generated, guided by
  `INVENTORY_RESPONSE_RULE` in `supabase/functions/_shared/ai-providers.ts:92`.
- `search_inventory` (the in-process tool) returns structured `InventorySearchResult`
  rows: `code`, `description`, `grade`, `price`, `order_url`, `display_url`. Results are
  cached in `offerCatalog` keyed by code.
- The offered photo is attached separately via `deriveOfferCodes` + `buildOfferAttachments`
  (already correct — unchanged here).
- The shared RPC `search_available_inventory` **already returns** every spec field
  (`cpu`, `ram_gb`, `storage_gb`, `gpu`, `screen_size`, `color`, `os_family`,
  `condition_notes`, `battery_health_pct`, …) plus `category_description_fields`. The
  frontend builds its rich description from these via `getItemDescription`
  (`src/services/items.ts:519`, `src/lib/utils.ts`). The edge function's
  `inventory-search.ts` currently **discards** these fields, mapping `description` to just
  `[brand, model_name].join(' ')`.
- Two call sites run the AI and derive offers independently and must stay in lockstep:
  - `supabase/functions/_shared/generate-draft.ts` — real draft saved to `messages`.
  - `supabase/functions/test-ai-reply/index.ts` — AI Test Playground backend.
- The final customer send path (`supabase/functions/send-message/index.ts:269`) posts
  `body: content` verbatim to Missive — no transformation. So whatever text we assemble is
  exactly what the customer receives.

## Design (to-be)

### Component 1 — `_shared/item-description.ts` (new, pure)

Port from `src/lib/utils.ts` into a Deno-pure module (no browser/date-fns deps):

- `buildShortDescription(values, descriptionFields)`
- `getItemDescription(item, productModel?, descriptionFields?)`
- The spec-field-label lookup `getItemDescription` depends on (`getSpecFieldLabel` /
  the label map).

These are the single algorithm replicated for the edge runtime. The frontend builder
lives in browser TS (`src/lib/utils.ts`, with date-fns and other browser deps) and cannot
be imported into a Deno test, so parity is guarded by a **golden-value** unit test: for
representative rows (phone, laptop, tablet) the ported builder must produce the exact
description strings the frontend produces today (captured as fixtures). If the frontend
builder changes, the fixtures and port are updated together.

### Component 2 — `inventory-search.ts` (modified)

- Expand `RawItemRow` to carry the spec fields the RPC already returns plus
  `category_description_fields`.
- In `mapInventoryResults`, build `description` via the ported `getItemDescription`
  (category-aware, rich) instead of brand+model concat. Behavior on items with no
  category description_fields falls back to the same basic concat the frontend uses.
- Sell groups: best-effort. Items are the focus of the examples; group descriptions stay
  as-is unless the group RPC already carries enough to use the builder. Documented as a
  known limitation, not a blocker.

### Component 3 — `_shared/offer-reply.ts` (new, pure)

- `formatOfferBlock(result: InventorySearchResult): string` — builds:
  ```
  🏷 {code}
  📝 {description}
  🏅 Rank {grade}      // omitted if grade is null
  💴 ¥{price}          // omitted if price is null; price formatted with thousands separator
  📸 Buy Now & View Photos: {order_url}
  ```
- `assembleOfferReply(reply: string, codes: string[], catalog: Map<string, InventorySearchResult>): string`:
  - If `{{OFFER}}` token present: replace it with the offered block(s), stacked and
    separated by a blank line (one block per code, capped consistent with the photo cap of 3).
  - If token absent but `codes` non-empty (model forgot the token): append the block(s)
    after a blank line at the end of the reply (fallback — still correct, block lands
    after the outro).
  - If `codes` empty: strip any stray `{{OFFER}}` token (replace with empty / clean
    whitespace) so the token never leaks to a customer.
  - Never emit markdown; URLs are bare.

### Component 4 — `INVENTORY_RESPONSE_RULE` (modified, `ai-providers.ts`)

Rewrite the SPECIFIC-ask guidance so the model:
- Writes a SHORT availability confirmation line.
- Puts the literal token `{{OFFER}}` on its own line where product details belong.
- Writes a SHORT closing line.
- Does **NOT** write the code, specs, grade, price, or order link itself.
- Does **NOT** use any markdown — no `**bold**`, no `[label](url)`, no bullet syntax.

The BROAD-ask path (qualify-then-handoff) is unchanged.

### Component 5 — Wire-in (both call sites)

In `generate-draft.ts` and `test-ai-reply/index.ts`, after `offerCodes` is derived from
the reply, set:

```ts
aiResponse.reply = assembleOfferReply(aiResponse.reply, offerCodes, offerCatalog);
```

before saving the draft / returning to the playground. This guarantees the playground
preview is byte-identical to the message the customer will receive.

### Component 6 — Playground preview (`messaging-settings.tsx`)

The reply text now already contains the emoji block, so the message bubble renders the
real final message. The product card, confidence badge, intent tag, and search trace
remain tester-only decoration (internal, never sent). Optional minor copy tweak to make
"this is what the customer sees" vs "internal" unambiguous — not required for correctness.

## Data flow

1. Customer asks about a specific item → model classifies SPECIFIC → calls
   `search_inventory`.
2. Tool runs RPC, maps rows with **rich** descriptions, caches in `offerCatalog`.
3. Model returns reply = intro + `{{OFFER}}` + outro (no markdown).
4. `deriveOfferCodes` extracts offered codes from the reply.
5. `assembleOfferReply` splices the emoji block(s) into the reply.
6. `buildOfferAttachments` attaches the photo(s) (unchanged).
7. Draft saved (`generate-draft`) / returned to playground (`test-ai-reply`).
8. On approve, `send-message` posts the assembled text + photo to Missive verbatim.

## Error handling / edge cases

- `grade` null → omit 🏅 line. `price` null → omit 💴 line. `description` empty → fall
  back to the brand+model concat (builder already does this); never blank.
- Multiple offered codes → one block each, capped at 3 (matches photo cap).
- Model omits `{{OFFER}}` → fallback appends blocks at end.
- No offer (non-sales reply) → stray token stripped; reply passes through untouched
  otherwise.
- Price formatting uses a thousands separator (e.g. `¥18,900`) via locale formatting
  available in the Deno runtime.

## Testing

- Unit: `formatOfferBlock` — full row, null grade, null price, missing description.
- Unit: `assembleOfferReply` — token present (single/multi), token absent with codes,
  no codes with stray token, no codes no token.
- Unit/parity: ported `getItemDescription` matches frontend builder on phone/laptop/tablet
  sample rows.
- Manual: AI Test Playground availability ask renders the emoji block + bare clickable
  link + attached photo, identical to the manual agent paste.

## Out of scope

- Rich descriptions for sell groups (best-effort only this pass).
- Any change to the photo attachment pipeline (already correct).
- Any change to the BROAD qualify-then-handoff flow.
