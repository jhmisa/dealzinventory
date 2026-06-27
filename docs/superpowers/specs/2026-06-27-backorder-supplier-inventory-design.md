# Backorder / Pre-order Supplier Inventory — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Owner:** Joey

## Problem

Dealz often wants to offer items it does not yet physically own — stock that is
listed and available on a supplier's website (primarily **iosys.co.jp**). Today
this is tracked manually in a Google Sheet ("Preorder Units"): brand, model, RAM,
storage, sell price, the iosys product link, rank, and quantity. There is no way
to surface this would-be inventory inside the app, so it cannot appear in stock
search or be offered to a customer who messages in.

We want to:
1. Add selected supplier inventory as **backorder** stock before buying it.
2. Have it appear in inventory search and be offerable when a customer messages.
3. Use a **"B" code** (backorder) for it, distinct from real inventory.
4. When a customer confirms, order it from the supplier; once it physically
   arrives and is taken through intake, the staff member **manually** links the
   new real **P-code** to the waiting order (the "B → P swap").
5. Reuse our own model photos where we have them; otherwise fall back to the
   supplier's product image.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| **Ingestion** | **Paste-to-add (assisted).** Paste an iosys URL or product code; an edge function fetches that one product page, parses it, and prefills a form the staff confirms. Human stays the curator; no manual typing. (A one-time bulk-sheet import may be added later as a convenience, out of scope here.) |
| **What a B-code represents** | **A quantity-bearing backorder *line*** (one model+config+grade+price with an available quantity), structurally like a sell-group — *not* one placeholder per unit. |
| **Customer messaging behavior** | **AI offers it, always labeled as pre-order with a lead time** (`⏳ Pre-order · ~N days`). |
| **Confirm/commit flow** | **Normal order pipeline.** Confirming creates a PENDING order like in-stock purchases; pre-order status is metadata. No special prepayment gate (can be revisited later). |
| **B → P swap** | **Manual staff action** during/after intake. Not automatic. |
| **Spec formatting** | B-code spec line must render **byte-identically** to P/G codes, via the existing `getItemDescription()` formatter. Requires mapping each backorder line to a real `product_model` on add. |
| **Placement** | Standalone page **`/admin/backorders`** ("Backorder") in the **Inventory** sidebar group, beside New Intake / Receiving Reports — not a tab inside the Items table. |

## Non-goals

- Full automated crawl of the iosys catalog. Rejected: thousands of irrelevant
  SKUs, heavy spec/photo mapping ETL, and freshness upkeep, for stock we'll
  mostly never offer. Human curation is the valuable signal.
- Prepayment / deposit gating for pre-orders (may be added later).
- Bulk import of the existing Google Sheet backlog (possible follow-up).
- Automatic supplier ordering (staff place the iosys order manually, outside the app).

---

## Data model

### New table: `backorder_lines`

One row per iosys listing we choose to pre-stock. Mirrors the spec columns on
`items` so the shared description formatter produces an identical spec line.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `backorder_code` | text UNIQUE | `B000001`, from new `b_code_seq` |
| `product_id` | uuid FK → product_models | **required**; resolved on add. Drives the spec line via the model's category `description_fields`. |
| `condition_grade` | grade enum (S/A/B/C/D/J) | mapped from iosys *rank* (New→S, A→A, B→B, C→C; D/J as needed) |
| `color` | text | parsed, editable |
| `storage_gb` | int | parsed, editable |
| `ram_gb` | int | parsed, editable |
| `cpu` | text | parsed, editable |
| `screen_size` | numeric | parsed, editable |
| `condition_notes` | text | optional |
| `supplier_id` | uuid FK → suppliers | the iosys supplier record |
| `supplier_price` | numeric | **our cost**, fetched from iosys (snapshot) |
| `selling_price` | numeric | **what the customer pays**, set by staff |
| `supplier_url` | text | the iosys product link |
| `supplier_product_code` | text | e.g. `384323` |
| `supplier_stock` | int | iosys-reported stock at fetch time (snapshot) |
| `quantity_total` | int | how many we're willing to offer; defaults to `supplier_stock`, editable |
| `quantity_reserved` | int | +1 per customer confirm |
| `quantity_received` | int | +1 per intake B→P swap |
| `lead_time_days` | int | drives the pre-order label; defaults from supplier, editable |
| `photo_group_id` | uuid FK → photo_groups, nullable | reuse our photos when model+color match |
| `supplier_image_url` | text, nullable | scraped iosys image, fallback when no photo group |
| `status` | enum: ACTIVE / PAUSED / CLOSED | only ACTIVE is searchable/offerable |
| `created_at`, `updated_at` | timestamptz | |
| `created_by` | uuid | staff who added it |

**Computed availability:** `available = quantity_total - quantity_reserved - quantity_received`.
Expose via a generated column or a view used by search. Only lines with
`status = ACTIVE` and `available > 0` are offerable.

**Code generation:** add `CREATE SEQUENCE b_code_seq START 1;` and mint via the
existing `generate_code('B', 'b_code_seq')` RPC (same pattern as P/G/PG).

**Grants/RLS:** follow the project's `ALTER DEFAULT PRIVILEGES` convention; RLS on,
staff-only write, read as required by search. Add `updated_at` trigger.

### Order linkage

A confirmed pre-order is a normal order whose line item points at a backorder
line until a real P-code exists.

- `order_items.backorder_line_id` — new nullable uuid FK → backorder_lines.
- `order_items.item_id` — relax to **nullable** (a pre-order line has no P-code yet).
- Invariant: each `order_items` row has **exactly one** of `item_id` (fulfilled /
  in-stock) or `backorder_line_id` (awaiting fulfillment). Enforce with a CHECK.
- On the manual swap, staff set `item_id` to the fresh P-code; `backorder_line_id`
  may be retained for provenance.

---

## Lifecycle

1. **Add** — staff paste an iosys URL/code → edge function fetches & parses →
   form prefilled → staff map to a `product_model`, set `selling_price`, confirm
   → mint `B000001`, `available = quantity_total`.
2. **Offer** — AI inventory search surfaces the line, labeled pre-order + lead time.
3. **Confirm** — customer confirms → PENDING order created; an `order_items` row
   with `backorder_line_id` set, `item_id` null; `quantity_reserved += 1`
   (available decrements).
4. **Order from supplier** — staff place the iosys order manually (outside the app).
5. **Intake** — arriving units are taken through the existing New Intake flow and
   mint normal **P-codes** as today (no change to intake itself).
6. **Swap (manual)** — on the backorder fulfillment view, staff link a fresh
   P-code to an open pre-order `order_item`: set `item_id`, `quantity_received += 1`.
   The order proceeds through the normal pipeline from there.
7. **Close** — when a line is exhausted or retired, staff set `status = CLOSED`.

---

## Ingestion & parsing (paste-to-add)

**Edge function** `fetch-supplier-product` (new):
- Input: an iosys URL or bare product code.
- Resolves the product code from the URL (`.../<slug>/<code>`), fetches the iosys
  product page, and parses: brand, model text, storage, color, iosys *rank*,
  iosys price (cost), stock count, and product image URL.
- Returns a structured payload; never writes — the form confirms before persist.
- Robustness: if a field can't be parsed it's left blank for staff to fill;
  parse failures surface as a clear error, not a crash.

**Add form** (the `Add Backorder` modal):
- Paste box → fetch → prefilled fields.
- **Required mapping step:** resolve the parsed model text to one of our
  `product_models` (dropdown pre-matched by best guess). If none matches, staff
  pick/create one before saving — same expectation as a normal item. This is what
  guarantees identical spec formatting.
- iosys *rank* → `condition_grade` (editable).
- Photo: if a `photo_group` exists for the mapped model+color, default to reuse;
  otherwise store the scraped `supplier_image_url`.
- Staff set `selling_price` (cost auto-filled), `quantity_total`, `lead_time_days`.
- Confirm → mint B-code.

---

## Search & messaging integration

- **New search path** `search_available_backorder_lines(search_query, result_limit,
  filter_brand, filter_category_id, price_min, price_max)` — same signature and
  result shape as `search_available_inventory` / `search_available_sell_groups`,
  living in `supabase/functions/_shared/inventory-search.ts`.
- Returns only `status = ACTIVE`, `available > 0`. Exact `B`-code lookup supported
  alongside the existing P/G exact-match path.
- `InventorySearchResult.type` gains `'backorder'`. Description and price render
  through the **shared formatter** (`getItemDescription`) — identical to P/G.
- **Offer block** reuses the existing code-assembled emoji format with two
  additions for backorder results: a **pre-order badge** and a **lead-time line**
  (`⏳ Pre-order · ~{lead_time_days} days`).
- Photo / `/mine` resolution: `photo_group_id` if present, else `supplier_image_url`.

---

## Admin UI — `/admin/backorders`

**Sidebar:** new entry **"Backorder"** in the **Inventory** group, under New Intake.

**List view:** B-code, spec line (shared formatter), grade, supplier price, sell
price, `available / reserved / received`, lead time, status. Search by B-code,
brand, model. Filters: status, supplier, grade.

**Add Backorder modal:** the paste-to-add flow above.

**Row actions:**
- Edit (sell price, `quantity_total`, lead time, status).
- Pause / Close.
- **Refresh from iosys** — re-run the fetch to update the price/stock snapshot
  (manual; no background cron).

**Fulfillment / swap view:** for a line with open pre-orders, list waiting
`order_items` and let staff pick a freshly-intaken P-code to link to each — the
manual B→P swap (sets `item_id`, bumps `quantity_received`).

---

## Affected surfaces (system map)

- **New migration(s):** `backorder_lines` table + `b_code_seq` + `order_items`
  column changes + `search_available_backorder_lines` RPC + RLS/grants/trigger.
- **New edge function:** `fetch-supplier-product`.
- **`_shared/inventory-search.ts`:** add backorder search path + `'backorder'` type.
- **Messaging offer assembly:** pre-order badge + lead-time line for backorder results.
- **New service:** `src/services/backorders.ts`.
- **New pages/components:** `src/pages/admin/backorders.tsx`, add-backorder modal,
  fulfillment/swap view; sidebar entry.
- **Types:** regenerate after migration.

## Open questions / future work

- **Prepayment gating** for pre-orders — deferred; revisit if customers ghost.
- **Bulk-sheet import** of the existing backlog — possible follow-up.
- **Stock/price freshness** — snapshot + manual refresh for v1; no auto-cron.
- **Multi-customer contention** beyond `available` — availability math prevents
  over-reserving; UX for "sold out / waitlist" on a B-line is out of scope for v1.
