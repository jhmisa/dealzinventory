# App-wide JST Timestamps (Design Spec)

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan
**Scope decision:** All human-readable timestamps across the app render in **Asia/Tokyo (JST)**.

## Problem

Timestamps in the app are formatted in the **viewer's browser-local timezone** — via
`date-fns` `format()` (local) in the shared `formatDate`/`formatDateTime` helpers, and
via scattered inline `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString`/
`toDateString` calls. When the admin's device isn't on JST, times and the
"Today / Yesterday" day-grouping drift from what Missive shows (Missive displays JST),
making messages look "missing" when they are present and in sync. The business and its
customers are in Japan, so all displayed times should be JST regardless of the admin's
device timezone.

Concretely: a customer message stored `2026-07-01T23:33:01Z` should display as
`2026-07-02 08:33` (JST), matching Missive.

## Goal

Every human-readable timestamp renders in **Asia/Tokyo**, app-wide, so the UI matches
Missive and reflects the Japan-based operation. Display-only change — storage, queries,
and date logic stay in UTC.

## Non-goals

- No user-configurable timezone setting (hardcoded `Asia/Tokyo`; trivially swappable later).
- No change to how timestamps are stored, queried, sorted, or compared.
- No new dependency (`@date-fns/tz` is already installed — date-fns v4's official TZ companion).
- Relative-time displays ("5m ago") are timezone-agnostic and are left unchanged.

## Approach

Introduce one constant and route all **display** formatting through it using
`@date-fns/tz`'s `TZDate`, which lets the existing `date-fns` format tokens render in a
fixed zone with a minimal code change.

```ts
// src/lib/utils.ts (or a small src/lib/datetime.ts)
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

export const APP_TIME_ZONE = 'Asia/Tokyo'
```

`TZDate` is constructed from a UTC instant and a zone; `format()` then emits the JST
wall-clock. Construct it from a `Date`/millis to avoid string-parse ambiguity:
`new TZDate(new Date(dateString), APP_TIME_ZONE)`.

### The high-leverage move

JST-anchor the two shared helpers in `src/lib/utils.ts` — used at ~127 call sites — so
the bulk of the app is fixed by editing two functions:

```ts
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(new TZDate(new Date(dateString), APP_TIME_ZONE), 'yyyy-MM-dd')
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(new TZDate(new Date(dateString), APP_TIME_ZONE), 'yyyy-MM-dd HH:mm')
}
```

### New shared helpers (for messaging + reuse)

```ts
// HH:mm in JST — for message-bubble times.
export function formatTime(dateString: string | null | undefined): string

// JST-aware day label: "Today" / "Yesterday" / "Mon D" — for the thread day-separators.
// Compares the JST calendar date of the message vs JST "now" (both via yyyy-MM-dd in JST),
// so boundaries align to Tokyo midnight, matching Missive.
export function formatDayLabel(dateString: string | null | undefined): string
```

## Critical guardrail — convert display, never data

Convert ONLY values rendered for a human. Leave untouched:
- `.toISOString()` used as query params / API bodies (e.g. `messaging-settings.tsx:1981`
  builds a "since" filter — stays UTC).
- Date math, comparisons, sorting (e.g. `Date.now() - new Date(x)` relative-time in
  `conversation-list.tsx`).
- Values written back to the DB or passed to Supabase.
- `input type="date"` values and form state.

Storage and logic stay in UTC exactly as today; only the presentation layer changes.

## Surfaces

| Surface | Change |
|---|---|
| `src/lib/utils.ts` — `formatDate`, `formatDateTime` | Wrap in `TZDate(..., APP_TIME_ZONE)`. Fixes ~127 call sites. |
| `src/lib/utils.ts` — new `formatTime`, `formatDayLabel` | JST message time + JST-aware day label. |
| `src/components/messaging/conversation-thread.tsx` | Replace local `formatTime`/`formatDate` with the JST helpers (fixes the drifted Today/Yesterday grouping). |
| `src/components/messaging/conversation-list.tsx` | `formatTimeAgo` is relative → **no change**. |
| ~20 files with inline `toLocale*` / `toDateString` display calls | Convert each display call to JST (route through helpers or add `{ timeZone: 'Asia/Tokyo' }`). Files: `pages/admin/{items,item-detail,postal-codes,staff-management,bulk-intake,messaging-settings}.tsx`, `components/ui/calendar.tsx`, `components/social-media/{post-card,item-search-input}.tsx`, `components/system-feedback/{feedback-detail-dialog,feedback-card}.tsx`, `components/backorders/add-backorder-dialog.tsx`, `components/orders/print-selection-dialog.tsx`. |
| PDFs / printed docs | Convert to JST (Japan business documents): `services/inventory-report-pdf.ts`, `components/intake/receipt-pdf.ts`, `components/orders/{invoice-pdf,batch-invoice-print}.ts`, `components/supplier-returns/return-report-print.ts`. |

Each inline site must be individually classified as **display** (convert) or
**data/logic** (leave) during implementation — the counts above are candidates, not a
blanket rewrite.

## Testing

Pure-function unit tests (fixed instants, no ambient TZ dependence):
- `formatDate('2026-07-01T23:33:01Z')` → `2026-07-02` (JST rolls to next day).
- `formatDateTime('2026-07-01T23:33:01Z')` → `2026-07-02 08:33`.
- `formatTime('2026-07-01T23:33:01Z')` → `08:33`.
- `formatDayLabel` around Tokyo midnight: a message at `2026-07-01T15:30:00Z`
  (00:30 JST next day) vs one at `2026-07-01T14:00:00Z` (23:00 JST same day) fall on
  different JST calendar days.
- Date-only input `'2026-07-01'` (parsed as UTC midnight) still formats as `2026-07-01`
  (JST is ahead, so it lands at 09:00 the same day — no date shift).
- Null/undefined → `'—'`.

Tests should pin the process zone (e.g. run under `TZ=America/New_York`) to prove the
output is JST regardless of the machine's zone.

Plus: `npx tsc --noEmit` clean, `npm run build` clean, and a Playwright spot check that
the conversation thread shows JST matching the Missive screenshot.
