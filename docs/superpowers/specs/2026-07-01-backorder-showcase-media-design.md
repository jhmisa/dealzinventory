# Backorder (B-code) Showcase Media — Design

**Date:** 2026-07-01
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch:** `feat/catalog-product-photos`

---

## Goal

Backorder (B-code) rows on the **Items list** get the same media / showcase
affordances that regular stock rows (P-codes, accessories, sell-groups) already
have, with the media sourced from the **tied Product Model** (plus any curated
backorder photos). Separately, **verify** — not rebuild — that the existing
B-code ordering + code-swap flow works end-to-end.

### Non-goals

- No standalone B-code *detail* page (the P-code detail page is not replicated;
  a B-code is not a physical item, so invoice/customer/battery fields don't apply).
- No changes to the customer `/mine` ordering flow, the `claim-mine` edge
  function, the swap dialog, or the fulfillment RPCs — Part 2 is verify-only.
- No changes to how backorder photos are curated (the Add-Backorder dialog).

---

## Context (what already exists)

The backorder subsystem is largely built:

- `backorder_lines` table carries flat spec columns + `product_id` (always tied
  to a `product_models` row) + `selling_price` / `discount_amount` / grade.
- `backorder_line_media` holds curated photos per backorder line
  (`file_url, source, sort_order`).
- **Customer ordering already works for B-codes** (Part 2):
  - `/mine/:code` → `getClaimableByCode` → `getClaimableBackorder` resolves the
    B-code (pre-order badge + lead-time), merging **curated backorder photos
    first, then product-model catalog media**.
  - `claim-mine` edge function handles the `B` prefix → `reserve_backorder_unit`
    RPC → creates an `order_item` with `backorder_line_id` and
    `backorder_status = AWAITING_ORDER` (item_id NULL) atomically.
  - `swap-dialog.tsx` + `fulfill_backorder_with_item` RPC + the "To Fulfill"
    queue let staff scan/type a matching AVAILABLE P-code later to swap it into
    the invoiced order item.

**The gap:** the *staff* Items list has no showcase affordance for B-codes:

- The B-code row (`items.tsx` unified_summary cell, ~L975–1013) renders **only**
  the "Copy Mine link" (`Link2`) icon — no Showcase Photos / Videos buttons, and
  its thumbnail is a dead `<img>` (P-code rows link the thumbnail to the product
  model).
- `showcase.ts` has `getShowcaseItem` / `getShowcaseSellGroup` /
  `getShowcaseAccessory` but **no `getShowcaseBackorder`**.
- `showcase.tsx` dispatch routes `A` → accessory, `G` → sell-group, else item —
  a `B` prefix falls through to `getShowcaseItem`, which queries the `items`
  table by `item_code`, finds nothing, and renders empty.

---

## Design

### 1. New showcase resolver — `getShowcaseBackorder(bCode)` in `src/services/showcase.ts`

Mirrors the existing resolvers and returns the same `ShowcaseItem` shape the
showcase page already consumes:

```ts
export interface ShowcaseItem {
  id: string
  item_code: string            // holds the B-code here
  selling_price: number | null
  purchase_price: number | null
  discount: number | null
  condition_grade: string | null
  condition_notes: string | null
  description: string
  photos: { id: string; url: string }[]
  videos: { id: string; url: string }[]
}
```

Behaviour:

- Look up `backorder_lines` by `backorder_code` (uppercased) and join
  `product_models(…, categories(name, description_fields), product_media(id, file_url, media_type, sort_order))`
  plus `backorder_line_media(id, file_url, sort_order)`. Return `null` if not found.
- **Photos** = curated `backorder_line_media` (sorted by `sort_order`) **first**,
  then product-model `product_media` images (`media_type === 'image'`, sorted).
  This is the same precedence as `getClaimableBackorder`, so the staff showcase
  matches the customer `/mine` view.
- **Videos** = product-model `product_media` where `media_type === 'video'`
  (sorted). (Curated backorder media is photos only, so there is no curated video
  source.)
- **description** via `getItemDescription(line, pm, pm.categories.description_fields)`
  — identical spec-line logic used across Admin Items / Backorders / `/mine`.
- **selling_price** = `line.selling_price`; **discount** = `line.discount_amount`
  (null when 0). The showcase page computes the effective/struck-through price
  from these the same way it does for items.
- **condition_grade** = `line.condition_grade`; **purchase_price** / **condition_notes**
  = null (not shown for pre-orders).
- Wrap in try/catch → return `null` on error (matches `getClaimableBackorder`),
  so a bad code renders the page's existing "not found" state rather than throwing.

### 2. Route the `B` prefix — `src/pages/admin/showcase.tsx`

Both fetcher-dispatch spots (the two `upper.startsWith(...)` chains) gain a
`B` branch **before** the `getShowcaseItem` default:

```ts
const fetcher = upper.startsWith('A') ? getShowcaseAccessory
  : upper.startsWith('G') ? getShowcaseSellGroup
  : upper.startsWith('B') ? getShowcaseBackorder
  : getShowcaseItem
```

Import `getShowcaseBackorder` alongside the existing showcase imports.

### 3. Items list B-row — `src/pages/admin/items.tsx` (unified_summary cell, ~L975–1013)

Bring the B-code row to parity with accessory / sell-group rows:

- **Thumbnail → product-model link.** Wrap the thumbnail in
  `<Link to={`/admin/products/${r.product_id}`}>` with the existing
  `h-10 w-10 … hover:ring-2 hover:ring-primary/50` classes and
  `title="Go to product model"`, matching P-code rows. When `r.product_id` is
  null, fall back to the current plain thumbnail box (no link).
- **Showcase buttons.** After the existing "Copy Mine link" (`Link2`) button, add:
  - **📷 Showcase Photos** — `Image` icon, `title="Showcase Photos"`,
    `onClick` → `openShowcase(r.backorder_code, 'photos')`.
  - **▶️ Showcase Videos** — `Play` icon, `title="Showcase Videos"`,
    `onClick` → `openShowcase(r.backorder_code, 'videos')`.

  Same `variant="ghost" size="icon" className="h-6 w-6"` styling and
  `e.stopPropagation()` guard as the accessory/sell-group rows. `openShowcase`
  already exists (`items.tsx:897`) and is code-agnostic — it broadcasts the code
  + mode and opens the `/admin/showcase` window; it needs no change.

No other row types, columns, or filters change.

### 4. Verify Part 2 (no rebuild)

Manual end-to-end check in the running app:

1. Open `/mine/Bxxxxx` for an ACTIVE backorder line with availability → confirm
   the pre-order product page renders (badge, lead-time, media).
2. Complete the order as a test customer → confirm an `order_item` is created
   with `backorder_line_id` set and `backorder_status = AWAITING_ORDER`
   (item_id NULL), and availability decrements.
3. Open the swap dialog from the "To Fulfill" queue, scan/type a matching
   AVAILABLE P-code → confirm the spec-match table passes and "Confirm swap"
   runs `fulfill_backorder_with_item`, switching the invoiced order item from the
   B-code placeholder to the real P-code.

If a bug surfaces, fix narrowly; otherwise no code change in Part 2.

---

## Testing

- **TDD — `getShowcaseBackorder`** (unit, against the resolver's data-shaping logic):
  - curated photos ordered before catalog photos, each group by `sort_order`;
  - catalog fallback when no curated photos exist (never image-less);
  - videos come only from product-model `product_media` with `media_type === 'video'`;
  - null / missing `product_models` → still returns a valid `ShowcaseItem`
    (photos possibly curated-only or empty; description falls back to the code);
  - unknown B-code → `null`.
- **Manual visual verification:** B-row shows 📷 / ▶️ icons + a clickable
  thumbnail; clicking 📷/▶️ opens the showcase window with the model's media on
  the correct tab; thumbnail navigates to `/admin/products/:id`.
- **Manual E2E:** Part 2 order → swap flow as above.

---

## Files touched

| File | Change |
|------|--------|
| `src/services/showcase.ts` | add `getShowcaseBackorder` |
| `src/pages/admin/showcase.tsx` | import + route `B` prefix in both fetcher dispatches |
| `src/pages/admin/items.tsx` | B-row: thumbnail link + Showcase Photos/Videos buttons |
| (tests) | unit tests for `getShowcaseBackorder` |
