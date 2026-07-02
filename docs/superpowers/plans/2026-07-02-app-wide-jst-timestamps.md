# App-wide JST Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every human-readable timestamp across the app in Asia/Tokyo (JST) so the UI matches Missive and reflects the Japan-based operation — a display-only change; storage/queries/logic stay in UTC.

**Architecture:** A new pure module `src/lib/datetime.ts` holds all display formatters (`formatDate`, `formatDateTime`, `formatTime`, `formatDayLabel`) anchored to `APP_TIME_ZONE = 'Asia/Tokyo'` via `@date-fns/tz`'s `TZDate` (already installed). `src/lib/utils.ts` re-exports `formatDate`/`formatDateTime` so its ~127 existing call sites are fixed with no import churn. The messaging thread uses the new helpers; the remaining ~12 inline date-display sites get `{ timeZone: 'Asia/Tokyo' }` added (format-preserving). Number `.toLocaleString()` calls and date-picker internals are explicitly left alone.

**Tech Stack:** React 18 + Vite + TypeScript, `date-fns` v4 + `@date-fns/tz` (installed), tests run via `npx tsx` (no vitest in repo) with `node:assert`.

**Spec:** [`docs/superpowers/specs/2026-07-02-app-wide-jst-timestamps-design.md`](../specs/2026-07-02-app-wide-jst-timestamps-design.md)

**Verified pre-work (do not re-decide):** `@date-fns/tz` is installed; `new TZDate(new Date('2026-07-01T23:33:01Z'), 'Asia/Tokyo')` + `format(...,'yyyy-MM-dd HH:mm')` yields `2026-07-02 08:33` even under `TZ=America/New_York`; date-only `'2026-07-01'` stays `2026-07-01`. `npx tsx src/lib/<file>.ts` runs from the project root.

**Critical guardrail (applies to every task):** Convert ONLY values rendered for a human. NEVER add a timezone to `.toISOString()` query params, date math/sorting, DB writes, or `input type="date"` values. Number `.toLocaleString()` (prices/counts) is NOT a date — leave it.

---

## Task 1: Create `src/lib/datetime.ts` + tests (TDD)

**Files:**
- Create: `src/lib/datetime.ts`
- Create (test): `src/lib/datetime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/datetime.test.ts`:

```ts
import assert from 'node:assert/strict'
import { APP_TIME_ZONE, formatDate, formatDateTime, formatTime, formatDayLabel } from './datetime'

// Constant
assert.equal(APP_TIME_ZONE, 'Asia/Tokyo')

// A late-UTC instant rolls to the next JST calendar day (23:33Z -> 08:33 JST next day)
assert.equal(formatDate('2026-07-01T23:33:01Z'), '2026-07-02')
assert.equal(formatDateTime('2026-07-01T23:33:01Z'), '2026-07-02 08:33')
assert.equal(formatTime('2026-07-01T23:33:01Z'), '08:33')

// Date-only input does NOT shift (UTC midnight -> 09:00 JST, same calendar day)
assert.equal(formatDate('2026-07-01'), '2026-07-01')

// Null/undefined guards
assert.equal(formatDate(null), '—')
assert.equal(formatDateTime(undefined), '—')
assert.equal(formatTime(null), '—')
assert.equal(formatDayLabel(null), '')

// formatDayLabel with an injected "now" (deterministic — not dependent on the real clock).
// now = 2026-07-10T05:00Z = 14:00 JST on Jul 10.
const NOW = new Date('2026-07-10T05:00:00Z')
assert.equal(formatDayLabel('2026-07-10T00:00:00Z', NOW), 'Today')       // 09:00 JST Jul 10
assert.equal(formatDayLabel('2026-07-09T10:00:00Z', NOW), 'Yesterday')   // 19:00 JST Jul 9
// Tokyo-midnight boundary: 14:59Z Jul 9 = 23:59 JST Jul 9 (Yesterday); 15:00Z Jul 9 = 00:00 JST Jul 10 (Today)
assert.equal(formatDayLabel('2026-07-09T14:59:00Z', NOW), 'Yesterday')
assert.equal(formatDayLabel('2026-07-09T15:00:00Z', NOW), 'Today')
// Older date -> "MMM d"
assert.equal(formatDayLabel('2026-07-01T23:33:01Z', NOW), 'Jul 2')       // Jul 2 JST

console.log('datetime.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TZ=America/New_York npx tsx src/lib/datetime.test.ts`
Expected: FAIL — cannot find module `./datetime` (not created yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/datetime.ts`:

```ts
// Single home for human-readable timestamp formatting. All output renders in Asia/Tokyo
// (JST) regardless of the viewer's device timezone — the business and its customers are in
// Japan and the UI must match Missive. DISPLAY ONLY: storage, queries, sorting, and date
// math stay in UTC. Do NOT use these for query params or values written back to the DB.
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

export const APP_TIME_ZONE = 'Asia/Tokyo'

function toZoned(dateString: string): TZDate {
  return new TZDate(new Date(dateString), APP_TIME_ZONE)
}

// yyyy-MM-dd in JST.
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(toZoned(dateString), 'yyyy-MM-dd')
}

// yyyy-MM-dd HH:mm in JST.
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(toZoned(dateString), 'yyyy-MM-dd HH:mm')
}

// HH:mm in JST — message-bubble times.
export function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(toZoned(dateString), 'HH:mm')
}

// JST-aware day label for message-thread separators: "Today" / "Yesterday" / "MMM d".
// Compares the JST calendar date of the message against JST "now" (injectable for tests).
export function formatDayLabel(
  dateString: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!dateString) return ''
  const dayKey = formatDate(dateString) // yyyy-MM-dd in JST
  const nowKey = format(new TZDate(now, APP_TIME_ZONE), 'yyyy-MM-dd')
  if (dayKey === nowKey) return 'Today'
  const yesterday = new TZDate(now, APP_TIME_ZONE)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey === format(yesterday, 'yyyy-MM-dd')) return 'Yesterday'
  return format(toZoned(dateString), 'MMM d')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TZ=America/New_York npx tsx src/lib/datetime.test.ts`
Expected: PASS — prints `datetime.test.ts: all assertions passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/datetime.ts src/lib/datetime.test.ts
git commit -m "feat(datetime): JST-anchored display formatters + tests"
```

---

## Task 2: Re-point `utils.ts` at `datetime.ts` (fixes ~127 call sites)

**Files:**
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Replace the two helper bodies with a re-export**

In `src/lib/utils.ts`, delete the existing `formatDate` and `formatDateTime` function definitions (currently around lines 128–136):

```ts
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(new Date(dateString), 'yyyy-MM-dd')
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  return format(new Date(dateString), 'yyyy-MM-dd HH:mm')
}
```

and replace them with a re-export from the new module (put it near the top-level exports):

```ts
// Timestamp formatters live in datetime.ts (JST-anchored). Re-exported here so existing
// `import { formatDate } from '@/lib/utils'` call sites keep working unchanged.
export { formatDate, formatDateTime } from './datetime'
```

- [ ] **Step 2: Remove the now-unused date-fns import**

`format` from `date-fns` was used ONLY by those two functions (verified: the only `format(` usages in `utils.ts` were lines 130 & 135). Delete line 3:

```ts
import { format } from "date-fns"
```

If (and only if) `npx tsc --noEmit` later reports `format` still used elsewhere in the file, keep the import instead.

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean. (This exercises the ~127 downstream call sites — a green build confirms the re-export resolves everywhere.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils.ts
git commit -m "refactor(datetime): route utils formatDate/formatDateTime through JST module"
```

---

## Task 3: Messaging conversation thread → JST helpers

**Files:**
- Modify: `src/components/messaging/conversation-thread.tsx`

- [ ] **Step 1: Import the JST helpers**

At the top of `src/components/messaging/conversation-thread.tsx`, add an import from the datetime module (place near the existing `@/lib/utils` import on line 4):

```ts
import { formatTime, formatDayLabel } from '@/lib/datetime'
```

- [ ] **Step 2: Delete the local `formatTime` and `formatDate` functions**

Remove these local definitions (currently lines 29–41):

```ts
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
```

- [ ] **Step 3: Point the day-separator call at `formatDayLabel`**

At the day-separator call site (currently line 247), change `formatDate` → `formatDayLabel`:

```ts
    const date = formatDayLabel(msg.created_at)
```

The bubble-time call site (currently line 458) already reads `{formatTime(msg.created_at)}` — it now resolves to the imported JST `formatTime`, no edit needed there.

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean. No remaining reference to a local `formatDate`/`formatTime` in this file.

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/conversation-thread.tsx
git commit -m "feat(messaging): JST times + day separators in conversation thread"
```

---

## Task 4: Sweep inline UI date-display sites → JST (format-preserving)

Add `{ timeZone: 'Asia/Tokyo' }` to each **date** display call, preserving its existing format. For a bare `.toLocaleDateString()`/`.toLocaleString()`/`.toLocaleTimeString()` (no args), pass `undefined` as the locale first so options can be added.

**Files & exact edits:**

- [ ] **Step 1: `src/components/social-media/post-card.tsx` (line ~66)**

```ts
// before: new Date(post.scheduled_at!).toLocaleDateString()
new Date(post.scheduled_at!).toLocaleDateString(undefined, { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 2: `src/components/system-feedback/feedback-card.tsx` (line ~45)**

```ts
// before: new Date(feedback.created_at).toLocaleDateString()
new Date(feedback.created_at).toLocaleDateString(undefined, { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 3: `src/components/system-feedback/feedback-detail-dialog.tsx` (line ~89)**

```ts
// before: new Date(feedback.created_at).toLocaleString()
new Date(feedback.created_at).toLocaleString(undefined, { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 4: `src/pages/admin/messaging-settings.tsx` (line ~2086)**

```ts
// before: new Date(m.created_at).toLocaleTimeString()
new Date(m.created_at).toLocaleTimeString(undefined, { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 5: `src/pages/admin/staff-management.tsx` (line ~528)**

```ts
// before: new Date(profile.created_at).toLocaleDateString()
new Date(profile.created_at).toLocaleDateString(undefined, { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 6: `src/pages/admin/item-detail.tsx` (lines ~398 and ~413)**

```ts
// line ~398 before: new Date(reservedBy.expiresAt).toLocaleString()
new Date(reservedBy.expiresAt).toLocaleString(undefined, { timeZone: 'Asia/Tokyo' })

// line ~413 before: new Date(item.missing_since).toLocaleDateString()
new Date(item.missing_since).toLocaleDateString(undefined, { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 7: `src/pages/admin/items.tsx` (line ~2136)**

Add the `timeZone` key to the existing options object (keep the other keys):

```ts
// before: sale.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
sale.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 8: `src/components/orders/print-selection-dialog.tsx` (line ~200)**

```ts
// before: new Date(order.created_at).toLocaleDateString('ja-JP')
new Date(order.created_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 9: Do NOT touch these (verify you left them alone)**

- Every `.toLocaleString(...)` that formats a **number** (price `¥{n.toLocaleString()}`, counts): `item-search-input.tsx:164`, `postal-codes.tsx:61/92/161/171`, `items.tsx:2142/2157`, `bulk-intake.tsx:190`, `messaging-settings.tsx:1614`, `add-backorder-dialog.tsx:468`.
- `src/components/ui/calendar.tsx:44` (month-nav label) and `:200` (`data-day` internal attribute) — date-picker internals; TZ-pinning could cause off-by-one selection. Leave.

- [ ] **Step 10: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 11: Commit**

```bash
git add src/components/social-media/post-card.tsx src/components/system-feedback/feedback-card.tsx src/components/system-feedback/feedback-detail-dialog.tsx src/pages/admin/messaging-settings.tsx src/pages/admin/staff-management.tsx src/pages/admin/item-detail.tsx src/pages/admin/items.tsx src/components/orders/print-selection-dialog.tsx
git commit -m "feat(datetime): pin inline UI date displays to JST"
```

---

## Task 5: Sweep PDF / print date-display sites → JST

Same format-preserving `{ timeZone: 'Asia/Tokyo' }` approach for printed business documents.

**Files & exact edits:**

- [ ] **Step 1: `src/services/inventory-report-pdf.ts` (line ~96)**

Add the `timeZone` key to the existing options:

```ts
// before: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' })
```

- [ ] **Step 2: `src/components/intake/receipt-pdf.ts` (line ~84)**

```ts
// before: adj.created_at ? new Date(adj.created_at).toLocaleDateString('ja-JP') : '—'
adj.created_at ? new Date(adj.created_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—'
```

- [ ] **Step 3: `src/components/supplier-returns/return-report-print.ts` (line ~31)**

Add the `timeZone` key to the existing options object in the date branch (the `¥{amount.toLocaleString()}` on line ~39 is a NUMBER — leave it):

```ts
// before: return new Date(iso).toLocaleDateString('en-US', { ...existing options })
return new Date(iso).toLocaleDateString('en-US', { ...existing options, timeZone: 'Asia/Tokyo' })
```

Read the file to see the exact existing option keys and add `timeZone: 'Asia/Tokyo'` alongside them (do not drop any).

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/inventory-report-pdf.ts src/components/intake/receipt-pdf.ts src/components/supplier-returns/return-report-print.ts
git commit -m "feat(datetime): pin PDF/print date displays to JST"
```

---

## Task 6: Verify end-to-end, version bump, ship

**Files:**
- Modify: `package.json` (version bump)
- Modify: `docs/PROJECT_STATE.md`

- [ ] **Step 1: Full verification sweep**

Run each and confirm:
- `TZ=America/New_York npx tsx src/lib/datetime.test.ts` → `all assertions passed`
- `npx tsc --noEmit` → clean
- `npm run lint` → no new errors
- `npm run build` → succeeds

- [ ] **Step 2: Playwright spot check (messaging thread shows JST)**

Log in with the dev staff creds (`.env.local` `DEV_STAFF_EMAIL`/`DEV_STAFF_PASSWORD`), open the Messages page, open a recent conversation, and confirm the message times + day separators are JST (a message stored `2026-07-01T23:33Z` shows `08:33` under a "Today"/JST-dated separator, matching Missive). Note the result.

- [ ] **Step 3: Bump version**

Bump `package.json` (patch — display fix, no new surface). Only if not already bumped this session.

- [ ] **Step 4: Update PROJECT_STATE.md**

Add a "Recently shipped" entry: app-wide JST timestamps — new `src/lib/datetime.ts` (JST via `@date-fns/tz`), `utils.ts` re-export (fixes ~127 sites), messaging thread + ~12 inline date sites pinned to `Asia/Tokyo`; numbers/pickers untouched; display-only (UTC storage unchanged). Reference the spec + this plan.

- [ ] **Step 5: Ship**

Use the `push-to-main` skill (commits remaining changes + pushes → Vercel production deploy).

---

## Self-Review Notes

- **Spec coverage:** `APP_TIME_ZONE` + `TZDate` approach (T1) · high-leverage `utils.ts` helpers fixing ~127 sites (T1+T2) · new `formatTime`/`formatDayLabel` (T1) · messaging thread times + JST day-separators (T3) · `conversation-list.tsx` left unchanged (relative time — not a task, per spec) · inline UI date sites (T4) · PDF/print date sites (T5) · display-vs-data guardrail (stated globally + T4/T5 leave-lists) · testing via tsx with pinned TZ (T1) + tsc/build/lint/Playwright (T6). All spec sections mapped.
- **Guardrail enforced:** every task converts only display values; number `.toLocaleString()`, query-param `.toISOString()`, date math, and date-picker internals are explicitly excluded (T4 Step 9, T5 Step 3 note).
- **Type/name consistency:** `formatDate`/`formatDateTime`/`formatTime`/`formatDayLabel`/`APP_TIME_ZONE` are defined once in `datetime.ts` (T1) and used verbatim in T2 (re-export) and T3 (thread). `formatDayLabel(dateString, now?)` signature is consistent between definition (T1) and the single-arg call in T3.
