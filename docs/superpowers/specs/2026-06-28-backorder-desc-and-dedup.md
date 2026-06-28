# Backorder follow-ups #2 — richer Admin description + duplicate-link guard

> Raised by Joey 2026-06-28 (after v1.61.0). Self-contained execution spec — a fresh
> session can implement this without re-investigating. Two independent issues.

---

## Issue 1 — Admin → Items description for backorder (B-code) rows is missing color + identifier

### What Joey sees / wants
- B000003 row shows: `Apple iPhone 16 Pro Max / A18 Pro / 8 / 256 / 6.9"` — **no color**, no model identifier.
- Joey wants it to ALSO show the **color** ("Desert Titanium") and the **model identifier**
  `A3295 (MYWJ3J/A)` (model_number + part_number) so staff can identify the exact SKU at a glance.

### ROOT CAUSE (confirmed, not a guess)
The backorder line's `product_model` has **`category_id = NULL`** → `categories.description_fields = null`.
`getItemDescription(item, pm, descriptionFields=null)` then takes the **generic fallback branch**
(`src/lib/utils.ts:166` and the identical Deno port `supabase/functions/_shared/item-description.ts:42`),
which builds `brand model / cpu / ram_gb / storage_gb / screen"` — it deliberately **omits color,
model_number, part_number**. That fallback output is exactly what Joey sees.
- Verified: B000003 → `line.color='Desert Titanium'`, `pm.color='Desert Titanium'`,
  `pm.model_number='A3295'`, `pm.part_number='MYWJ3J/A'`, but `category=NULL`/`description_fields=NULL`.
- This affects **every iosys-promoted product_model** (Phases 3/4/5 fill-gaps left `category_id` NULL),
  so all backorders + any P-items on those models show the bare fallback (no color).

### Constraint to respect
Memory [[feedback_consistent_descriptions]]: descriptions must be **identical between Admin Items
and Messages "Search Inventory"**. The two frontend copies of `getItemDescription` (lib/utils.ts
+ _shared/item-description.ts) are kept in parity, guarded by golden test
`supabase/functions/_shared/item-description.test.ts`.

### DECISION (recommended approach)
Split by audience:
- **Color = universal core spec** → add to the `getItemDescription` **fallback** in BOTH copies, so it
  shows on Admin Items, Messages search, AND customer offers/shop (customers want to know the color).
- **Identifier `A3295 (MYWJ3J/A)` = staff-only** → append in the **frontend backorder description
  builders only**, NOT in the shared/edge offer path (we don't want raw Apple part numbers cluttering
  customer-facing offer text).

### Tasks
1. **Color in fallback (both copies + test):**
   - `src/lib/utils.ts` `getItemDescription` fallback (the `else` after the descriptionFields branch):
     insert `color` into `parts`, e.g. after `fullModel`:
     ```ts
     const color = item.color ?? productModel?.color
     const parts = [fullModel, color, item.cpu, item.ram_gb, item.storage_gb, screenSize ? `${screenSize}"` : null].filter(Boolean)
     ```
   - Mirror EXACTLY in `supabase/functions/_shared/item-description.ts` (lines 54-65).
   - Update golden values in `supabase/functions/_shared/item-description.test.ts`; run
     `deno test --allow-read supabase/functions/_shared/` until green.
   - **Redeploy offer edge fns** that bundle `_shared` so AI offers pick up color:
     `generate-pending-drafts`, `test-ai-reply` (and `send-via-missive` if it renders descriptions).
2. **Identifier on the two staff backorder surfaces (append AFTER the shared desc, so it stays
   out of `getItemDescription` and thus out of customer offers):**
   - `src/pages/admin/items.tsx` `getBackorderDesc()` (~line 202): after the `getItemDescription`
     call, append `model_number (part_number)` from `line.product_models`:
     ```ts
     const ident = pm?.model_number ? (pm.part_number ? `${pm.model_number} (${pm.part_number})` : pm.model_number) : null
     return ident ? `${base} · ${ident}` : base
     ```
     (`listBackorderLines` selects `product_models(*)` so both fields are present.)
   - `src/services/items.ts` `searchAvailableBackorderLines()` (~line 700-745, the Messages Search
     Inventory source): append the SAME identifier suffix so the two staff surfaces stay identical.
     ⚠ Its data comes from RPC `search_available_backorder_lines`, which returns `model_number` but
     **NOT `part_number`** — add `part_number` to the RPC's RETURNS + SELECT (new migration), and to
     `RawBackorderRow`/the mapper if needed, OR (simpler) have `searchAvailableBackorderLines` show
     just `model_number` and accept a minor divergence. Prefer adding part_number to the RPC for true parity.
   - Do NOT touch `_shared/inventory-search.ts` / `offer-reply.ts` identifier-wise — offers show color only.
3. **(Durable follow-up, optional / ties to product-model accuracy work):** backfill `category_id` on
   the iosys-promoted product_models so they use `description_fields`. If done, ensure those categories'
   `description_fields` include `color` (else color regresses, since the fallback no longer applies).
   The staff identifier suffix is unaffected (appended outside getItemDescription).

---

## Issue 2 — duplicate supplier links: same item can be added twice

### What Joey found
He added the same supplier URL twice → **two identical backorder lines**. CONFIRMED in data:
- **B000003 and B000004** share the exact same `product_id` (d36959bf-…), `condition_grade=A`,
  `storage_gb=256`, `color=Desert Titanium`, and the **identical `supplier_url`** (iosys …/350998).

### ROOT CAUSE
`createBackorderLine` (`src/services/backorders.ts:73`) and the Add-Backorder dialog
(`src/components/backorders/add-backorder-dialog.tsx` `handleSubmit` ~line 427) have **no uniqueness
guard** — nothing checks for an existing line with the same SKU/URL before inserting.

### DECISION
Primary = **app-level pre-submit guard** with a clear message (best UX, ships safely). Optional
hardening = DB partial unique index (after cleaning the existing dupe).

### Tasks
1. **Clean the existing duplicate first:** B000003 vs B000004 (neither has live orders — the v1.61.0
   E2E test order was cleaned up). Either delete B000004, or bump B000003 `quantity_total` to 2 and
   delete B000004. Confirm `backorder_line_status` enum values first (`ARCHIVED` may exist — prefer
   archive over hard delete if photos exist via `backorder_line_media`).
2. **App-level guard in `add-backorder-dialog.tsx` `handleSubmit`** (before `createBackorderLine`):
   query existing ACTIVE lines that match the SKU identity
   `(product_id == values.product_id AND condition_grade == values.condition_grade AND
   normalizeStorageGb(storage_gb) == … AND lower(color) == …)` **OR** same `supplier_url`. If a match
   exists, **block** and show an inline/toast error naming the existing code, e.g.
   *"A pre-order for this exact item already exists (B000003). Edit that line — e.g. increase its
   quantity — instead of adding a duplicate."* Add a `findExistingBackorderLine(...)` helper to
   `src/services/backorders.ts`.
3. **(Optional hardening) DB partial unique index** as a backstop against other code paths:
   ```sql
   CREATE UNIQUE INDEX backorder_lines_active_sku_uniq
     ON public.backorder_lines (product_id, condition_grade, COALESCE(storage_gb, -1), lower(COALESCE(color, '')))
     WHERE status = 'ACTIVE';
   ```
   ⚠ Will FAIL to build while the B000003/B000004 dupe exists — clean dupes (task 1) FIRST. Decide
   whether two ACTIVE lines for the same SKU are EVER legitimate (batches → handle via `quantity_total`,
   so a unique index is safe). Keep it scoped to `status='ACTIVE'` so re-adding after archive still works.

---

## Verification / deploy
- `npm run build` + `npm run lint` clean (0 NEW issues; pre-existing: items.tsx `SessionSale` unused,
  orders.ts `items` prefer-const — leave them).
- `deno test --allow-read supabase/functions/_shared/` green (description parity).
- Redeploy `generate-pending-drafts`, `test-ai-reply` (+ any fn bundling `_shared/item-description`).
- Bump `package.json` (→ v1.62.0), update PROJECT_STATE "Recently shipped", push to main.
- Manual: open Admin → Items → Backorder chip, confirm B-row shows color + `A3295 (MYWJ3J/A)`;
  try adding the same iosys URL twice → blocked with the existing-code message.
