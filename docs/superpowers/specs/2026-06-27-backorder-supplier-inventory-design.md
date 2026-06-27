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
- **Adapters for suppliers other than iosys.** v1 builds the iosys adapter only;
  the fetch/parse layer is structured so future suppliers each add one adapter
  without touching the rest of the system (see Ingestion → adapter pattern).

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
| `photo_group_id` | uuid FK → photo_groups, nullable | reuse our photos when model+color match (takes precedence over media rows) |
| `status` | enum: ACTIVE / PAUSED / CLOSED | only ACTIVE is searchable/offerable |
| `created_at`, `updated_at` | timestamptz | |
| `created_by` | uuid | staff who added it |

**Computed availability:** `available = quantity_total - quantity_reserved - quantity_received`.
Expose via a generated column or a view used by search. Only lines with
`status = ACTIVE` and `available > 0` are offerable.

### New table: `backorder_line_media`

A backorder line can hold multiple curated photos (mirrors `photo_group_media`).
Used only when `photo_group_id` is null; otherwise the reused photo group's media
wins.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `backorder_line_id` | uuid FK → backorder_lines (ON DELETE CASCADE) | |
| `file_url` | text | points at **our** storage (copied), not a hotlink |
| `source` | enum: `iosys` / `web` / `manual` | provenance of the candidate |
| `sort_order` | integer | 0 = hero |
| `created_at` | timestamptz | |

**Photo sourcing (curate-then-keep):**
- On paste-to-add, the iosys adapter returns the listing's **full gallery** of
  image URLs (not just one). An optional **"Search web for more"** button calls a
  pluggable image-search provider for extra candidates.
- Candidates render as a selectable grid; staff **delete the ones they don't
  want**. Kept candidates are **downloaded and re-uploaded into our storage**
  (bucket `backorder-media`, public read / staff write) and stored as
  `backorder_line_media` rows — so an offer never breaks if iosys delists.
- If a `photo_group` already exists for the mapped model+color, staff can instead
  reuse it (`photo_group_id` set); then no media rows are needed.
- These are lightweight placeholder photos, superseded by the real photo group
  once the unit is intaken — full 1080/256 WebP processing is **not** required
  here (single copied image per kept photo is fine).

**Image-search provider (pluggable, optional):** behind one interface keyed by an
env var (e.g. `IMAGE_SEARCH_PROVIDER` + API key). v1 may ship with the provider
unconfigured — the "Search web for more" button is hidden/disabled until a key is
set, so the iosys gallery path works with zero extra setup. (Provider + key is a
setup decision for Joey; see Open questions.)

**Code generation:** add `CREATE SEQUENCE b_code_seq START 1;` and mint via the
existing `generate_code('B', 'b_code_seq')` RPC (same pattern as P/G/PG).

**Grants/RLS:** follow the project's `ALTER DEFAULT PRIVILEGES` convention; RLS on,
staff-only write, read as required by search. Add `updated_at` trigger.

### Order linkage

A confirmed pre-order is a normal order whose line item points at a backorder
line until a real P-code exists.

- `order_items.backorder_line_id` — new nullable uuid FK → backorder_lines.
- `order_items.item_id` — relax to **nullable** (a pre-order line has no P-code yet).
- `order_items.backorder_status` — new enum, used only when `backorder_line_id`
  is set: `AWAITING_ORDER → ORDERED → READY → FULFILLED`. Drives the To Fulfill
  worklist (see below).
- Invariant: a pre-order `order_items` row has `backorder_line_id` set with
  `item_id` null until the swap; an in-stock row has `item_id` set and
  `backorder_line_id` null. After the swap a fulfilled pre-order row has **both**
  (`item_id` = the assigned P-code, `backorder_line_id` kept for provenance).
  Enforce the legal combinations with a CHECK.
- On the manual swap, staff set `item_id` to the fresh P-code and
  `backorder_status = FULFILLED`.

---

## Lifecycle

1. **Add** — staff paste an iosys URL/code → edge function fetches & parses →
   form prefilled → staff map to a `product_model`, set `selling_price`, confirm
   → mint `B000001`, `available = quantity_total`.
2. **Offer** — AI inventory search surfaces the line, labeled pre-order + lead time.
3. **Confirm** — customer confirms → PENDING order created; an `order_items` row
   with `backorder_line_id` set, `item_id` null, `backorder_status = AWAITING_ORDER`;
   `quantity_reserved += 1` (available decrements).
4. **Order from supplier** — staff place the iosys order manually (outside the app)
   and mark the pre-order **Ordered** (`backorder_status = ORDERED`).
5. **Intake** — arriving units are taken through the existing New Intake flow and
   mint normal **P-codes** as today (no change to intake itself). When eligible
   matching stock exists, the waiting pre-order auto-flips to **READY**.
6. **Swap (manual)** — staff scan/enter a fresh P-code; the system verifies specs
   (hard-block on core mismatch) and links it: set `item_id`,
   `backorder_status = FULFILLED`, P-item → RESERVED, `quantity_received += 1`.
   The order proceeds through the normal pipeline from there.
7. **Close** — when a line is exhausted or retired, staff set `status = CLOSED`.

---

## Fulfillment worklist & B → P swap

There is **no existing process** for this: today's flow is buy → intake → sell
(intake is invoice-driven, i.e. already purchased). Backorder inverts it to
sell → buy → intake, so the procurement/fulfillment worklist is new.

### "To Fulfill" worklist (in `/admin/backorders`)

Aggregates every outstanding pre-order `order_item` across all B-lines, grouped by
status, with a procurement summary:

| State (`backorder_status`) | Meaning | Staff action |
|---|---|---|
| `AWAITING_ORDER` | Customer confirmed; supplier order not yet placed | **Mark ordered** (after placing the iosys order) |
| `ORDERED` | Supplier order placed; en route | — (waiting on arrival) |
| `READY` | Matching stock arrived & passed intake | **Swap to P-code** |
| `FULFILLED` | P-code linked; leaves the worklist into the normal order pipeline | — |

- **Procurement summary** rolls up `AWAITING_ORDER` rows per B-line/supplier:
  e.g. "order 3× B000001, 2× B000007 from iosys."
- `READY` is set automatically when at least one **eligible** P-code exists for
  the line (see eligibility), so actionable items surface without hunting.

### The swap (manual, one unit at a time)

1. Staff open a `READY` pre-order and **scan the QR or type the P-code** (or pick
   from the system's pre-filtered list of eligible matches).
2. **Verification** compares the scanned P-item to the B-line and renders a
   field-by-field ✓/✗. **Core specs hard-block:** `product_model`, `storage_gb`,
   `color`, `condition_grade` must all match or the swap is refused. Soft fields
   (e.g. battery note) may warn only.
3. **Eligibility** — a P-code can be swapped in only if it is `AVAILABLE`
   (inspected — same bar as any sale), matches the core specs, and is not already
   in an order or sell-group.
4. **Confirm** → `order_item.item_id` = P-code, `backorder_status = FULFILLED`,
   P-item → `RESERVED` (one-item-one-order constraint applies),
   `quantity_received += 1`. One P-code ↔ one order unit; multiple waiting
   pre-orders are each an explicit confirm.

## Ingestion & parsing (paste-to-add)

**Edge function** `fetch-supplier-product` (new):
- Input: a supplier product URL (or bare code) — the function detects which
  supplier adapter to use from the URL/host (or an explicit supplier hint).
- Returns a **normalized** structured payload regardless of source: brand, model
  text, storage, color, supplier rank/grade, supplier price (cost), stock count,
  product image URL, and the canonical product code. Never writes — the form
  confirms before persist.
- Robustness: if a field can't be parsed it's left blank for staff to fill;
  parse failures surface as a clear error, not a crash.

**Per-supplier adapter pattern (extensibility — designed in now, only iosys built):**
- The function dispatches to a **supplier adapter** behind a single interface,
  e.g. `parseProduct(input) → NormalizedSupplierProduct`. Adapters are selected
  by host/URL pattern (and fall back to an explicit supplier choice in the form).
- **v1 ships exactly one adapter: `iosys`.** No other supplier is implemented.
- Adding a future supplier (different website, different scraping) means writing a
  new adapter that emits the same `NormalizedSupplierProduct` shape — **nothing
  downstream changes**: the add form, `backorder_lines`, search, messaging, and
  the B→P swap are all supplier-agnostic and key off `supplier_id`.
- Grade/rank mapping (supplier rank → our `condition_grade`) lives **inside each
  adapter**, since rank vocabularies differ per supplier.
- The data model is already supplier-neutral: `supplier_id`, `supplier_url`,
  `supplier_product_code` carry whichever supplier the line came from.

**Add form** (the `Add Backorder` modal):
- Paste box → fetch → prefilled fields.
- **Required mapping step:** resolve the parsed model text to one of our
  `product_models` (dropdown pre-matched by best guess). If none matches, staff
  pick/create one before saving — same expectation as a normal item. This is what
  guarantees identical spec formatting.
- iosys *rank* → `condition_grade` (editable).
- Photo: the adapter returns the iosys **gallery** (multiple images). Staff curate
  a selectable grid (delete unwanted; optional "Search web for more"); kept images
  are copied into `backorder-media` and saved as `backorder_line_media` rows. If a
  `photo_group` exists for the mapped model+color, staff may reuse it instead
  (`photo_group_id` set, no media rows). See **Photo sourcing** above.
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
- Photo / `/mine` resolution: `photo_group_id` media if present, else the hero
  `backorder_line_media` row (lowest `sort_order`).

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

**To Fulfill worklist:** a second view/tab on the page showing all outstanding
pre-orders grouped by `backorder_status` (To order / Ordered / Ready to swap),
with the procurement summary and per-row actions ("Mark ordered", "Swap to
P-code"). The swap action runs the scan + verify + hard-block flow above. See
**Fulfillment worklist & B→P swap**.

---

## Affected surfaces (system map)

- **New migration(s):** `backorder_lines` table + `b_code_seq` + `order_items`
  column changes (`backorder_line_id`, nullable `item_id`, `backorder_status`
  enum + CHECK) + `search_available_backorder_lines` RPC + a spec-match/eligibility
  helper for the swap + RLS/grants/trigger.
- **New edge function:** `fetch-supplier-product`.
- **`_shared/inventory-search.ts`:** add backorder search path + `'backorder'` type.
- **Messaging offer assembly:** pre-order badge + lead-time line for backorder results.
- **New table + bucket:** `backorder_line_media` + `backorder-media` storage bucket.
- **Image sourcing:** iosys adapter returns the gallery (`imageUrls: string[]`); a
  pluggable image-search provider module (optional, env-keyed) for "Search web for
  more"; a copy-to-storage step for kept candidates.
- **New service:** `src/services/backorders.ts`.
- **New pages/components:** `src/pages/admin/backorders.tsx`, add-backorder modal,
  fulfillment/swap view; sidebar entry.
- **Types:** regenerate after migration.

## Open questions / future work

- **Image-search provider + API key** for "Search web for more" — needs a decision
  (e.g. Google Custom Search JSON API, SerpAPI, Brave). v1 ships with iosys-gallery
  working and the web-search button disabled until a key is configured.
- **Prepayment gating** for pre-orders — deferred; revisit if customers ghost.
- **Bulk-sheet import** of the existing backlog — possible follow-up.
- **Stock/price freshness** — snapshot + manual refresh for v1; no auto-cron.
- **Multi-customer contention** beyond `available` — availability math prevents
  over-reserving; UX for "sold out / waitlist" on a B-line is out of scope for v1.
