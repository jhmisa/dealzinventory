# Plan — Roll fuzzy search into the remaining (deferred) surfaces

**Context for next session (post-/clear).** The reusable separator-insensitive search engine shipped in v1.82.0 and was rolled out broadly in v1.83.0. This doc captures the surfaces still NOT converted, why they were deferred, and exactly how to do each. Read the memory `project_reusable_fuzzy_search` first.

## The engine (already built — REUSE, don't reinvent)
- **SQL** (`supabase/migrations/20260629120000` + `..130000` + `..150000`): `public.search_fold()`, `public.search_normalize()`, `public.search_matches(haystack text, query text) returns boolean`. Use in any RPC `WHERE public.search_matches(concat_ws(' ', <fields>), <query>)`.
- **TS** (`src/lib/search.ts`): `searchMatches(haystack, query)`, `normalizeSearchText()`, `searchQueryTokens()`, `foldSearchText()`. Use in any client-side `.filter()`. **Keep SQL & TS mirrors in sync.**
- **Rule:** token-AND; a SHORT pure-numeric token (≤3 digits) needs a `\m` word boundary (keeps "iphone 11" from matching iPhone 6s); everything else (letters, or 4+ digit numbers like A-numbers/codes) uses separator-insensitive substring.

## How to test (no DB password locally — test through the running app)
1. Dev server runs on http://localhost:5174 (vite, points at the same remote DB). Login: `.env.local` DEV_STAFF_EMAIL / DEV_STAFF_PASSWORD (admin login at /admin/login).
2. Fastest verification = call RPCs directly from the logged-in page via Playwright `browser_evaluate` (read the `sb-...-auth-token` from localStorage, POST to `${VITE_SUPABASE_URL}/rest/v1/rpc/<name>` with apikey=anon + Bearer token). For client-side filters, type into the actual search box and read results.
3. Always assert: (a) previously-broken joined/spaced/dashed query now HITS, (b) a nonsense query returns 0, (c) precision case `iphone 11` still excludes iPhone 6s.

---

## Remaining surfaces (in priority order)

### 1. Admin Items MAIN search box  ← the one Joey most wants (`src/pages/admin/items.tsx`)
**Current:** the `q` search box → `debouncedSearch` → `baseFilters.search` → `useItems()` → `getItems()` (`src/services/items.ts`) → `applySearchFilter()` which ONLY does `item_code ILIKE` (plus G-code resolution via `resolveGCodeToItemIds`). So typing "iphone" finds nothing by brand/model today.

**Why deferred — the entanglement:** `baseFilters.search` is ALSO fed to `useItemStatusCounts(baseFilters)` and `useSellGroupStatusCounts(baseFilters)`, which compute per-status tab-badge counts SERVER-side using the search term. Moving item search to client-side fuzzy means badges can't stay search-filtered (badge counts span ALL statuses, but the page only loads the active tab's rows).

**Recommended approach (client-side — `getItems` already pages the full tab via `fetchAllPages`):**
- Stop passing plain-text search to `useItems` (KEEP G-code → still resolve server-side; G-code rows aren't in the item haystack). Practically: in items.tsx, pass `search` to `useItems` only when `isGCodeSearch`; otherwise omit it so the full active-tab set loads.
- Add `searchMatches` in `filteredItems` over a rich item haystack: `item_code`, `brand`/`model_name`/`color`/`storage_gb`/`ram_gb`/`cpu` (item-level then `product_models` fallback), `supplier_description`, `condition_notes`, and `getItemDescription(item)`.
- **Decide the badge behavior (ask Joey or default):** simplest = make tab badges show per-status TOTALS (drop `search` from `useItemStatusCounts`/`useSellGroupStatusCounts`); the search then filters only the visible list. This is a common, defensible UX. Confirm before shipping since it's a visible change.
- Sub-views already fuzzy (don't touch): sell-groups/accessories/backorder use the converted services.

### 2. Messaging customer-linker (`src/components/messaging/customer-linker.tsx:~36`)  ← EASIEST
Currently a 6-field PostgREST `.or()` typeahead over customers. **Just call the existing `search_customers_with_receivers` RPC** (already fuzzy as of migration `20260629140000`) instead of the `.or()`. One-function swap.

### 3. Orders-tab server search (`src/services/orders.ts:~12 getOrders`)
Pre-resolves matching customer IDs via `.or()` over customers + `customer_addresses` (receiver names), then filters orders by IDs + `order_code`. The orders page already fetches all orders for tab counts. **Approach:** convert to `fetchAllPages` + client-side `searchMatches` over `order_code` + customer fields + receiver names (embed them in the select), OR build a `search_orders` RPC. Same badge-count coupling caveat as Items (counts at orders.tsx ~259). Offers search is already fuzzy (client-side) — mirror that.

### 4. Social-media item search (`src/components/social-media/item-search-input.tsx`)  ← lowest priority
3 separate PostgREST queries (items / accessories / sell-groups). Reuse `search_available_inventory` (AVAILABLE items, already fuzzy) for the items query; accessories + sell-groups services are already fuzzy — route through them. Or leave as-is.

---

## Versioning / deploy
- v1.82.0 = engine + 4 RPCs. v1.83.0 = Shop + admin lists + customers. Next batch → bump to **v1.84.0** (once for the session).
- Migrations apply via `supabase db push` (CLI is linked; no password needed). Frontend deploys on push to `main` (Vercel). Use the `push-to-main` flow or a focused commit (don't sweep the many stray untracked screenshots into the commit).
