# Shoot Inventory Picker + Recorded-Video Posting Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Replace the New Shoot dialog's blind "type a code" box with the canonical searchable `<InventoryPicker>`; (2) give each Recorded-Video card **Queue / Schedule / Post Now** actions that push to Blotato on click (killing the "then press Process Queue" double-handling).

**Architecture:** Pure wiring over existing machinery — **no DB migrations**. Recorded videos are already `social_media_posts` rows (`post_type='video'`) with the Facebook target set via column defaults. The `schedule_type` enum already has `now | next_slot | scheduled`, and the `process-social-queue` edge function already publishes a single post (`{ post_id }`) mapping those enum values to Blotato (immediate / next-free-slot / exact time). The card actions set `schedule_type` (+ `scheduled_at`) + `status='queued'`, then invoke the single-post processor.

**Tech Stack:** React + TypeScript, TanStack Query, shadcn/ui (Popover, Button), Supabase JS, Blotato via the `process-social-queue` Deno edge function.

**Design spec:** `docs/superpowers/specs/2026-07-09-shoot-picker-and-recorded-video-actions-design.md`

**Testing note (matches this codebase):** The service functions here are thin Supabase/edge-function wrappers and the changes are UI wiring — the repo does **not** unit-test these (its `*.test.ts` files cover only pure logic like `timeline.ts` / `mixMusicBed`). So verification is: `tsc` + `eslint` + `npm run build` green, then a **real Playwright E2E** with the dev-staff login (creds in `.env.local`, see `reference_dev_staff_login`), cleaning up any test data. Do not invent Supabase mocks.

---

### Task 1: Single-post param on `processSocialQueue`

**Files:**
- Modify: `src/services/social-media-posts.ts` (the `processSocialQueue` function, ~line 152)

- [ ] **Step 1: Add an optional `postId` param**

Replace the existing `processSocialQueue` function body:

```ts
// Server-side processor: generates captions (if blank) + publishes queued posts to Blotato.
// Pass a postId to process just that one post (used by the Recorded Videos card actions).
export async function processSocialQueue(postId?: string) {
  const { data, error } = await supabase.functions.invoke('process-social-queue', {
    body: postId ? { post_id: postId } : {},
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { processed: number; published: number; scheduled: number; failed: number }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the existing no-arg caller `processSocialQueue()` in `social-media.tsx` still type-checks — `postId` is optional).

- [ ] **Step 3: Commit**

```bash
git add src/services/social-media-posts.ts
git commit -m "feat(social): processSocialQueue accepts an optional single post_id"
```

---

### Task 2: Recorded-video posting service functions

**Files:**
- Modify: `src/services/recorded-videos.ts` (add import + replace `requeueRecordedVideo` with three self-publishing functions; keep `deleteRecordedVideo`)

- [ ] **Step 1: Add the import**

At the top of `src/services/recorded-videos.ts`, below the existing imports, add:

```ts
import { processSocialQueue } from '@/services/social-media-posts'
```

- [ ] **Step 2: Replace `requeueRecordedVideo` with the three actions**

Delete the whole existing `requeueRecordedVideo` function (the block starting with the `// Re-add a recorded video to the posting queue.` comment) and replace it with:

```ts
// Stage a recorded video for posting (set schedule fields + status='queued', clear any prior error),
// then push THIS post to Blotato via the single-post processor. Shared by all three card actions.
async function stageAndPush(
  id: string,
  fields: { schedule_type: 'now' | 'next_slot' | 'scheduled'; scheduled_at?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('social_media_posts')
    .update({
      status: 'queued',
      error_message: null,
      schedule_type: fields.schedule_type,
      scheduled_at: fields.scheduled_at ?? null,
    })
    .eq('id', id)
  if (error) throw error
  await processSocialQueue(id)
}

// Queue for posting at Blotato's next free slot (auto-spaced). Pushes immediately — no Process Queue.
export async function queueRecordedVideo(id: string): Promise<void> {
  await stageAndPush(id, { schedule_type: 'next_slot' })
}

// Schedule for an exact time (ISO 8601). Pushes to Blotato immediately with that scheduledTime.
export async function scheduleRecordedVideo(id: string, whenISO: string): Promise<void> {
  await stageAndPush(id, { schedule_type: 'scheduled', scheduled_at: whenISO })
}

// Publish right now via Blotato.
export async function postRecordedVideoNow(id: string): Promise<void> {
  await stageAndPush(id, { schedule_type: 'now' })
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/pages/admin/recorded-videos.tsx` (it still imports the now-removed `requeueRecordedVideo`). That file is fixed in Task 3. `recorded-videos.ts` itself must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/recorded-videos.ts
git commit -m "feat(recorded-videos): queue/schedule/post-now services that push to Blotato"
```

---

### Task 3: Recorded-Video card actions (Queue + Schedule popover + keep Delete)

**Files:**
- Modify: `src/pages/admin/recorded-videos.tsx` (imports, `VideoCard`, page mutations + wiring, header copy)

- [ ] **Step 1: Update imports**

In `src/pages/admin/recorded-videos.tsx`:

Change the lucide import line to add `CalendarClock` and `Send`:

```ts
import { Loader2, Trash2, CalendarPlus, CalendarClock, Send, Film, Search, User } from 'lucide-react'
```

Add the Popover import (below the existing `Select` import block):

```ts
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
```

Change the services import block to drop `requeueRecordedVideo` and add the three new functions:

```ts
import {
  getRecordedVideos,
  queueRecordedVideo,
  scheduleRecordedVideo,
  postRecordedVideoNow,
  deleteRecordedVideo,
  type RecordedVideo,
} from '@/services/recorded-videos'
```

- [ ] **Step 2: Replace the `VideoCard` component**

Replace the entire `VideoCard` function (currently lines ~47–132, from `function VideoCard({` through its closing `}`) with:

```tsx
function VideoCard({
  video,
  onQueue,
  onSchedule,
  onPostNow,
  onDelete,
  busy,
}: {
  video: RecordedVideo
  onQueue: (v: RecordedVideo) => void
  onSchedule: (v: RecordedVideo, whenISO: string) => void
  onPostNow: (v: RecordedVideo) => void
  onDelete: (v: RecordedVideo) => void
  busy: boolean
}) {
  const [duration, setDuration] = useState<number | null>(null)
  const [schedOpen, setSchedOpen] = useState(false)
  const [when, setWhen] = useState('')
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative flex h-64 items-center justify-center bg-black">
        {video.url ? (
          <video
            src={video.url}
            controls
            preload="metadata"
            playsInline
            className="h-full w-full object-contain"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        ) : (
          <Film className="h-10 w-10 text-muted-foreground" />
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[video.status]}`}
        >
          {video.status}
        </span>
        {duration != null && fmtDuration(duration) && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {fmtDuration(duration)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-medium">{video.item_code ?? 'Untagged'}</span>
          <span className="text-xs text-muted-foreground">{fmtDate(video.created_at)}</span>
        </div>

        {(video.product_title || video.product_description || video.product_price != null) && (
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            {video.product_title && (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{video.product_title}</span>
                {video.product_price != null && (
                  <span className="shrink-0 text-sm font-semibold">{formatPrice(video.product_price)}</span>
                )}
              </div>
            )}
            {video.product_description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{video.product_description}</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          {video.shooter_name ?? 'Unknown'}
        </div>
        {video.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{video.caption}</p>}

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-xs"
            disabled={busy}
            onClick={() => onQueue(video)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
            Queue
          </Button>

          <Popover open={schedOpen} onOpenChange={setSchedOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={busy}>
                <CalendarPlus className="h-3.5 w-3.5" />
                Schedule
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-2">
              <p className="text-xs font-medium">Schedule for</p>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="block w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  disabled={busy || !when}
                  onClick={() => {
                    onSchedule(video, new Date(when).toISOString())
                    setSchedOpen(false)
                  }}
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Schedule
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 gap-1.5 text-xs"
                  disabled={busy}
                  onClick={() => {
                    onPostNow(video)
                    setSchedOpen(false)
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Post Now
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete(video)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace `requeueMutation` with a single posting mutation**

In `RecordedVideosPage`, replace the whole `requeueMutation = useMutation({ ... })` block (lines ~145–154) with:

```tsx
  type PostAction =
    | { id: string; kind: 'queue' | 'now' }
    | { id: string; kind: 'schedule'; whenISO: string }

  const postMutation = useMutation({
    mutationFn: (a: PostAction) =>
      a.kind === 'queue'
        ? queueRecordedVideo(a.id)
        : a.kind === 'now'
          ? postRecordedVideoNow(a.id)
          : scheduleRecordedVideo(a.id, a.whenISO),
    onSuccess: (_data, a) => {
      toast.success(
        a.kind === 'schedule'
          ? 'Scheduled — pushed to Blotato.'
          : a.kind === 'now'
            ? 'Posting now via Blotato.'
            : 'Queued — Blotato will post at the next free slot.',
      )
      queryClient.invalidateQueries({ queryKey: QK })
      queryClient.invalidateQueries({ queryKey: ['social-media-posts'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to post'),
    onSettled: () => setBusyId(null),
  })
```

- [ ] **Step 4: Rewire the `<VideoCard>` render props**

Replace the `<VideoCard ... />` usage (lines ~272–281) with:

```tsx
            <VideoCard
              key={v.id}
              video={v}
              busy={busyId === v.id}
              onQueue={(video) => {
                setBusyId(video.id)
                postMutation.mutate({ id: video.id, kind: 'queue' })
              }}
              onSchedule={(video, whenISO) => {
                setBusyId(video.id)
                postMutation.mutate({ id: video.id, kind: 'schedule', whenISO })
              }}
              onPostNow={(video) => {
                setBusyId(video.id)
                postMutation.mutate({ id: video.id, kind: 'now' })
              }}
              onDelete={(video) => setDeleteTarget(video)}
            />
```

- [ ] **Step 5: Update the page header copy**

Replace the `PageHeader` description prop (line ~207):

```tsx
        description="Browse shot videos — search by who shot them, then Queue, Schedule, or Post Now to Blotato."
```

- [ ] **Step 6: Type-check + lint + build**

Run: `npx tsc --noEmit && npx eslint src/pages/admin/recorded-videos.tsx src/services/recorded-videos.ts src/services/social-media-posts.ts && npm run build`
Expected: all pass, no errors (the removed `requeueRecordedVideo` reference is gone).

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/recorded-videos.tsx
git commit -m "feat(recorded-videos): Queue/Schedule/Post Now card actions (push to Blotato on click)"
```

---

### Task 4: New Shoot dialog reuses `<InventoryPicker>`

**Files:**
- Modify: `src/components/shoots/shoot-form-dialog.tsx` (import + `addCodeValue` helper + embed the picker)

- [ ] **Step 1: Add imports**

In `src/components/shoots/shoot-form-dialog.tsx`, add below the existing component imports:

```ts
import { InventoryPicker } from '@/components/shared/inventory-picker'
```

- [ ] **Step 2: Add an `addCodeValue` helper and route `addCode` through it**

Replace the existing `addCode` function (lines ~96–104) with:

```ts
  function addCodeValue(value: string) {
    const v = value.trim()
    if (!v) return
    const current = form.getValues('item_codes')
    if (!current.includes(v)) {
      form.setValue('item_codes', [...current, v], { shouldValidate: true })
    }
  }

  function addCode() {
    addCodeValue(codeInput)
    setCodeInput('')
  }
```

(`removeCode` and `handleCodeKeyDown` are unchanged — the manual input still works as a fallback.)

- [ ] **Step 3: Embed the picker in the Item Codes field**

In the `item_codes` `FormField`, inside `<FormItem>`, insert the picker directly above the `<div className="rounded-md border p-2">` chip box:

```tsx
                <FormItem>
                  <FormLabel>Item Codes</FormLabel>
                  <InventoryPicker
                    onAdd={(item) => addCodeValue(item.code)}
                    addedCodes={codes}
                    resultsClassName="max-h-56"
                  />
                  <div className="rounded-md border p-2">
```

(Leave the rest of the field — the chip list and the manual `<Input>` fallback — exactly as-is.)

- [ ] **Step 4: Widen the dialog so the picker fits**

Change the `DialogContent` className (line ~159) from `sm:max-w-[520px]` to give the picker room:

```tsx
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
```

- [ ] **Step 5: Type-check + lint + build**

Run: `npx tsc --noEmit && npx eslint src/components/shoots/shoot-form-dialog.tsx && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/shoots/shoot-form-dialog.tsx
git commit -m "feat(shoots): New Shoot item codes use the canonical InventoryPicker"
```

---

### Task 5: End-to-end verification (real Chromium) + ship

**Files:** none (verification + docs/version)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (note the local URL, typically `http://localhost:5173`).

- [ ] **Step 2: Verify Part 1 — Shoot picker (Playwright MCP, dev-staff login)**

Log in with the dev-staff creds from `.env.local` (see `reference_dev_staff_login`). Navigate to **Shoots → New Shoot**. In Item Codes:
- Type a real query (e.g. a brand or code prefix) in the picker's search → results render.
- Click **Add** on a row → a chip with that code appears; the row flips to the checked "Added" state.
- Confirm the manual "type a code and press Enter" input still adds a chip.
- Fill Title, click **Create Shoot** → toast "Shoot created"; the new shoot card shows the code(s).

Expected: picker search + add works; manual fallback works; shoot persists the codes.

- [ ] **Step 3: Verify Part 2 — card actions (against a test post)**

Ensure at least one Recorded Video exists (record/export a short one from the Video Editor, or confirm an existing `post_type='video'` draft). On its card:
- **Queue** → toast "Queued — Blotato will post at the next free slot."; card status leaves `draft` (→ `processing`/`scheduled`). Verify with:
  `supabase db query --linked "SELECT status, schedule_type, blotato_submission_id, error_message FROM social_media_posts WHERE id='<id>';"` — expect `schedule_type='next_slot'` and either a `blotato_submission_id` (success) or a populated `error_message` (surfaced on the board's Failed column).
- **Schedule** → open popover, pick a future date/time, click **Schedule** → toast "Scheduled — pushed to Blotato."; DB row shows `schedule_type='scheduled'` + `scheduled_at` set.
- **Post Now** → toast "Posting now via Blotato."; DB row shows `schedule_type='now'`.
- **Delete** → confirm dialog still removes the row + storage object.

Expected: each action pushes without needing Process Queue; DB reflects the right `schedule_type`/`scheduled_at`.

- [ ] **Step 4: Confirm the batch path still works**

On **Social Media**, confirm the **Process Queue** button is unchanged and still targets image posts (no regression). (No queued image posts is fine — just confirm the button renders and its confirm dialog copy is intact.)

- [ ] **Step 5: Clean up test data**

Delete any throwaway test video/post created during verification (card **Delete**, or `supabase db query --linked "DELETE FROM social_media_posts WHERE id='<id>';"` + remove its storage object). Do NOT delete real posts.

- [ ] **Step 6: Bump version + update docs**

- The session version was already bumped to `1.104.0` for the music bed. Bump `package.json` to `1.105.0` (new feature, once more this session is acceptable since it's a distinct shippable feature) OR keep `1.104.0` if shipping together — pick per how you deploy. Default: bump to `1.105.0`.
- Update `docs/PROJECT_STATE.md` "Now": add a shipped entry for both improvements (files touched, no-migration note).
- Update the spec status line to "SHIPPED".

- [ ] **Step 7: Ship**

Use the `push-to-main` flow: stage exactly the changed files (the 4 source files + package.json + docs), commit, `git push origin HEAD:main` → Vercel production deploy. Do NOT stage the many unrelated untracked screenshots in the working tree.

---

## Self-Review

**Spec coverage:**
- Part 1 (Shoot picker) → Task 4. ✅
- Part 2 Queue/Schedule/Post Now → Tasks 1–3. ✅ (`now`/`next_slot`/`scheduled` mapping via existing processor; single-post param added in Task 1.)
- Keep Delete → Task 3 Step 2 (Delete button retained). ✅
- No migration / Process Queue unchanged → Tasks are wiring-only; Task 5 Step 4 checks the batch path. ✅
- Failure surfacing → Task 5 Step 3 checks `error_message`; the board already renders Retry on failed posts (design "Failure handling"). ✅

**Placeholder scan:** none — every code step shows full code; commands have expected output.

**Type consistency:** `queueRecordedVideo(id)` / `scheduleRecordedVideo(id, whenISO)` / `postRecordedVideoNow(id)` defined in Task 2 are imported + called with matching signatures in Task 3. `processSocialQueue(postId?)` (Task 1) is called as `processSocialQueue(id)` in Task 2. `AvailableInventoryResult.code` (verified) is read in Task 4. `PostAction` union matches the three `postMutation.mutate({...})` call sites. Card prop names (`onQueue`/`onSchedule`/`onPostNow`/`onDelete`/`busy`) match between the component definition and its render site.
