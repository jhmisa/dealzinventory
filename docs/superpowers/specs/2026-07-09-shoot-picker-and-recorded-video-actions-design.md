# Shoot inventory picker + Recorded-Video posting actions (Joey, 2026-07-09)

> **Status: design LOCKED (approved in conversation 2026-07-09).** Two independent improvements to
> the video-marketing flow. No DB migrations required — both wire over existing machinery.

## Motivation

Two friction points Joey surfaced:

1. **New Shoot "Item Codes" is a blind text box.** You must type P/G/A/B codes from memory
   ("Type a code and press Enter"). The Video Editor already has a proper searchable inventory picker
   — we should reuse it, not reinvent. (Reuse principle: `<InventoryPicker>` is the ONE canonical
   product selector.)

2. **Recorded Videos cards force double-handling.** Today each card has a single **Re-queue** button
   that only moves the post to the Queued column; you then have to go press **Process Queue** to
   actually publish. Joey wants to click once and have it go to Blotato.

---

## Part 1 — New Shoot picker

**Component:** `src/components/shoots/shoot-form-dialog.tsx` (the New/Edit Shoot dialog).

Embed the existing `<InventoryPicker>` (`src/components/shared/inventory-picker.tsx`) in the Item Codes
field, above the current chip UI:

- `onAdd={(item) => addCode(item.code)}` — reuses the dialog's existing `addCode`/chip state.
- `addedCodes={codes}` so already-selected rows render the checked "Added" state.
- Keep the removable chip list (existing UI) and keep the manual "type a code" `Input` as a fallback
  for codes not surfaced by the picker.
- `item_codes` stays `string[]`; no service/schema/validator change.

**Isolation:** `InventoryPicker` is presentation + search only (parent owns `onAdd`). The dialog only
gains the picker element + an `addCode(code)` call — no new data flow.

---

## Part 2 — Recorded-Video posting actions

**Files:** `src/pages/admin/recorded-videos.tsx` (card + page), `src/services/recorded-videos.ts`
(service), `src/services/social-media-posts.ts` (single-post processor param).

### Existing machinery being reused (verified 2026-07-09)
- A recorded video **is** a `social_media_posts` row (`post_type='video'`), created by the Video Editor
  as `status='draft'`, `platform='facebook'`.
- `account_id` / `page_id` have **column defaults** (`28293` / page `120712288014827` — the Dealz FB
  page), so every video row already carries the Blotato target. No target-picking needed.
- `schedule_type` enum = **`now` | `next_slot` | `scheduled`** (already exists).
- Edge function `process-social-queue` publishes `status='queued'` posts to Blotato and **accepts a
  single `post_id`** (`body: { post_id }`). Its Blotato mapping:
  - `scheduledTime = schedule_type==='scheduled' ? scheduled_at : null`
  - `useNextFreeSlot = schedule_type==='next_slot'`
  - `now` → both null/false → **immediate publish**.
  - Auto-generates a caption if the post's caption is blank.

So "publish a single recorded video to Blotato" = set `schedule_type` (+ `scheduled_at` when
scheduled) + `status='queued'`, then invoke `process-social-queue` with that `post_id`.

### Card actions (replaces the single Re-queue button; **Delete stays** as the trailing trash icon)

| Button | Fields set | Then | Result |
|---|---|---|---|
| **Queue** | `schedule_type='next_slot'`, `status='queued'` | invoke single-post processor | Blotato auto-slots into the next free posting time (auto-spaced); post → Scheduled → Published |
| **Schedule** | `schedule_type='scheduled'`, `scheduled_at=<chosen ISO>`, `status='queued'` | invoke single-post processor | Blotato schedules for exactly that time; post → Scheduled |
| **Post Now** | `schedule_type='now'`, `status='queued'` | invoke single-post processor | Blotato publishes immediately; post → Published |

All three push to Blotato **on click** — no separate Process Queue step for these cards. The three
differ only by timing: Queue = auto-spaced next slot, Schedule = exact time, Post Now = immediate.

### UI
- Card footer: **Queue** (primary) + **Schedule** (opens a small popover) + Delete (trash icon).
- **Schedule** popover: a `datetime-local` input + a **Schedule** confirm button + a **Post Now**
  button. (Post Now lives inside the Schedule popover per Joey's description; Queue is its own button.)
- While an action is in-flight the card shows a spinner / disabled state (existing `busy` pattern).
- On success: toast + invalidate the recorded-videos query so the card reflects its new status.

### Service additions (`src/services/recorded-videos.ts`)
- `queueRecordedVideo(id)` → set `next_slot` + `queued` + clear `error_message`, then process `id`.
- `scheduleRecordedVideo(id, whenISO)` → set `scheduled` + `scheduled_at` + `queued`, then process `id`.
- `postRecordedVideoNow(id)` → set `now` + `queued`, then process `id`.
- (Reuse a shared helper that updates the row then calls the single-post processor.)
- `requeueRecordedVideo` is superseded by `queueRecordedVideo` (same intent, now self-publishing).

### `processSocialQueue(postId?)`
Add an optional `postId` param to `src/services/social-media-posts.ts#processSocialQueue` that passes
`{ post_id }` to the edge function (the function already supports it). Returns the same
`{ processed, published, scheduled, failed }` shape.

### Failure handling
If the processor returns `failed > 0` (or throws), surface the row's `error_message` on the card (the
board already renders a "Retry" affordance on failed posts). The single-post invoke keeps the same
error semantics as the batch Process Queue.

---

## Out of scope / unchanged
- The **Process Queue** button on the Social Media board stays — it still serves image posts created
  via *New Post* (that flow still stages drafts).
- No DB migration. No change to `social_media_posts` schema, `blotato.ts`, or the enum.
- No change to how the Video Editor creates the draft (still `draft` + default FB target).

## Verification
- **Part 1:** open New Shoot → search a real code in the picker → click Add → chip appears → Create →
  shoot row persists the code. Manual-entry fallback still works. tsc/eslint/build green.
- **Part 2:** for a real recorded-video draft: **Queue** → post leaves Draft, Blotato submission id
  set, lands Scheduled (next slot); **Schedule** with a future time → `scheduled_at` set, Scheduled
  column; **Post Now** → immediate publish path. Verify against a test post (clean up after). Confirm
  the batch Process Queue still works for image posts.
