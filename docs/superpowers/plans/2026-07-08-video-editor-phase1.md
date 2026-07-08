# Video Editor (Review & Trim) — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the LOCKED `docs/investigations/recorder-trim-mockup.html` prototype into a real React "Review & Trim" video editor that trims/cuts an uploaded video, draws a logo, exports a Facebook-ready MP4 **client-side via WebCodecs/MediaBunny (cuts skipped)**, uploads it, and creates a `draft` social post — closing the "post a finished video" gap. Music bed is deferred (a fast follow).

**Architecture:** Three layers, cleanly split. (1) A **pure, framework-free timeline model** (`src/lib/video-editor/timeline.ts`) — the mockup's cut-list math (boundaries → pieces → removed ranges → `keepIntervals`), immutable + unit-tested. (2) A **client-side export engine** (`src/lib/video-editor/export-video.ts`) — MediaBunny decodes the source, keeps only `keepIntervals` (re-timestamped continuously → no gaps), draws each frame + logo onto a canvas, re-encodes H.264/AAC, muxes MP4. (3) **React UI** (`src/components/video-editor/*`) porting the mockup (ruler/pieces/trim-handles/zoom/playhead + keyboard S/⌫/undo) and a page that uploads the export directly to a new public `social-media` bucket and creates a `draft` `social_media_posts` row (existing "Process Queue" button pushes it to Blotato later).

**Tech Stack:** React 18 + Vite + TS, TanStack Query, shadcn/ui, Tailwind; **MediaBunny** (MIT, WebCodecs mux/encode — NEW dep); Supabase Storage (new public `social-media` bucket) + Postgres (`social_media_posts`, exists). Unit tests: `node:assert/strict` run via `npx tsx` (mirrors `src/lib/datetime.test.ts`). UI/export: Playwright. Source notes: `docs/investigations/2026-07-03-social-video-marketing-automation.md` (LOCKED trim model), `recorder-trim-mockup.html` (interaction spec).

> ### ⚠️ Outward-facing safety
> The editor creates posts as **`status:'draft'`** — it NEVER publishes. Publishing stays behind the existing human-in-the-loop "Process Queue" button on the Social Media page. Nothing in this plan calls Blotato. Keep it that way.

> ### 🌐 Browser constraint (accepted decision)
> Export is **Chromium-only** (Chrome/Edge) — WebCodecs `VideoEncoder`/`AudioEncoder`. This is an internal staff tool; mandate Chrome. The editor must **feature-detect** (`'VideoEncoder' in window`) and show a "Use Chrome/Edge to export" notice instead of crashing on Safari/Firefox.

---

## File Structure

**New — pure logic + export engine (`src/lib/video-editor/`)**
- Create: `src/lib/video-editor/timeline.ts` — types + pure cut-list model (the mockup's math).
- Create: `src/lib/video-editor/timeline.test.ts` — `node:assert/strict` unit tests.
- Create: `src/lib/video-editor/logo.ts` — `LogoConfig` + `drawLogo(ctx,...)` canvas wordmark.
- Create: `src/lib/video-editor/export-video.ts` — `exportEditedVideo()` MediaBunny pipeline.
- Create: `src/lib/video-editor/index.ts` — barrel.

**New — React UI (`src/components/video-editor/`)**
- Create: `src/components/video-editor/review-trim-timeline.tsx` — the timeline (ruler/pieces/handles/zoom/playhead).
- Create: `src/components/video-editor/logo-controls.tsx` — logo on/off + corner picker.
- Create: `src/components/video-editor/video-editor.tsx` — editor shell (preview + controls + playback + undo + export).
- Create: `src/components/video-editor/index.ts` — barrel.

**New — page + wiring**
- Create: `src/pages/admin/video-editor.tsx` — upload → edit → export → upload → draft post.
- Create: `supabase/migrations/20260708150000_social_media_bucket.sql` — public `social-media` bucket + storage policies.
- Modify: `src/routes.tsx` — lazy import + `{ path: 'video-editor' }` route.
- Modify: `src/components/layout/sidebar.tsx` — nav entry near Social Media / Shoots.
- Modify: `src/pages/admin/social-media.tsx` — "Trim & post a video" button → `/admin/video-editor`.
- Modify: `package.json` — add `mediabunny`; bump version at ship.

**Deferred to Phase 1b (the SPACE-advance recorder) — NOT built here:** the canvas recorder, `?shoot=` code preloading feeding item boundaries, "Make video" on shoot cards, and the music bed. The `timeline.ts` model already accepts an `itemBounds: number[]` field so the recorder's SPACE taps drop in with zero model changes.

---

## Task 0: MediaBunny spike — prove decode → cut → logo → mux (de-risk)

**Files:** Modify `package.json` (+`mediabunny`); Create throwaway `src/lib/video-editor/_spike.ts` (deleted at end of task).

**Why first:** The export engine is the only real technical risk. Prove the MediaBunny primitive end-to-end on a real clip before building UI around it. This task also **pins the exact MediaBunny API** used by Task 3.

- [ ] **Step 1: Install MediaBunny.**

Run: `npm install mediabunny`
Expected: added to `dependencies`, `npm ls mediabunny` shows a version (≥1.x).

- [ ] **Step 2: Read the real API (do NOT skip).** WebFetch these and note the exact symbol names + signatures for: reading (`Input`, `ALL_FORMATS`, `BlobSource`, `getPrimaryVideoTrack`, `getPrimaryAudioTrack`, a video-frame sink that yields decoded frames with `.timestamp`/`.duration`/`.draw(ctx)` or `.toCanvasImageSource()`, an audio-sample sink), and writing (`Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource`, an audio source, `addVideoTrack`, `addAudioTrack`, `start`, `finalize`).
  - https://mediabunny.dev/guide/introduction
  - https://mediabunny.dev/guide/reading-media-files
  - https://mediabunny.dev/guide/media-sinks
  - https://mediabunny.dev/guide/writing-media-files
  - https://mediabunny.dev/guide/media-sources
  - https://mediabunny.dev/guide/converting-media-files

  **Record the confirmed symbol table as a comment block at the top of `export-video.ts` in Task 3.** If a symbol name below differs from the docs, the docs win — update Task 3's code to match.

- [ ] **Step 3: Write a spike** proving the whole chain against a real file. Create `src/lib/video-editor/_spike.ts` exporting one function that: opens a source `Blob`, keeps two ranges (e.g. `[{start:0,end:1},{start:3,end:4}]`) skipping the middle, draws a red rectangle "logo" in the top-right of every frame, muxes an MP4, returns the `Blob`. Use the API confirmed in Step 2. Log `output.size` and expected duration (~2s).

- [ ] **Step 4: Run the spike in a real Chromium via Playwright.** Create a temporary Playwright test `e2e/_spike-export.spec.ts` that: navigates to the dev app, uses `page.evaluate` to import the spike (or inline the logic), feeds it a tiny fixture MP4 (generate one with `ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=30 -f lavfi -i sine=frequency=440:duration=5 -c:v libx264 -c:a aac -shortcut e2e/fixtures/testsrc.mp4` — or reuse any small mp4), and asserts the returned blob is a non-trivial MP4 that a `<video>` element can load with `duration` ≈ 2s (±0.3s).

Run: `npx playwright test e2e/_spike-export.spec.ts`
Expected: PASS — output MP4 loads, duration ≈ 2s, has an audio track.

- [ ] **Step 5: If the audio path is hard, note it and proceed video-only for the spike ONLY.** (Task 3 must still do audio; if MediaBunny audio copy proves genuinely blocked, STOP and report — do not ship a silent-export editor without flagging it.)

- [ ] **Step 6: Delete the spike, keep the dep + the API notes.**

```bash
rm src/lib/video-editor/_spike.ts e2e/_spike-export.spec.ts
git add package.json package-lock.json
git commit -m "chore(video-editor): add mediabunny; spike-verified decode→cut→logo→mux MP4 export"
```

---

## Task 1: Pure timeline model + unit tests (TDD)

**Files:**
- Create: `src/lib/video-editor/timeline.ts`
- Test: `src/lib/video-editor/timeline.test.ts`

This is the mockup's `<script>` math (`recorder-trim-mockup.html` lines 130–147, 187–192), typed + immutable. It owns the **export contract** `keepIntervals`.

- [ ] **Step 1: Write the failing test** (`timeline.test.ts`) — mirrors `src/lib/datetime.test.ts` style (top-level `node:assert/strict`, final console.log).

```ts
import assert from 'node:assert/strict'
import {
  makeTimeline, boundaries, pieces, addSplit, removePiece, restorePiece,
  setTrim, cutTotal, finalLength, keepIntervals, type TimelineState,
} from './timeline'

// duration 100, item boundaries (SPACE taps) at 30 and 70
const base: TimelineState = makeTimeline(100, [30, 70])

// boundaries always include 0 + duration + item bounds, sorted & deduped
assert.deepEqual(boundaries(base), [0, 30, 70, 100])
assert.deepEqual(pieces(base).map((p) => [p.start, p.end]), [[0, 30], [30, 70], [70, 100]])

// no cuts yet → full length
assert.equal(cutTotal(base), 0)
assert.equal(finalLength(base), 100)
assert.deepEqual(keepIntervals(base), [{ start: 0, end: 100 }])

// remove the middle item (30–70): keepIntervals splits around it
const s1 = removePiece(base, { start: 30, end: 70 })
assert.equal(cutTotal(s1), 40)
assert.equal(finalLength(s1), 60)
assert.deepEqual(keepIntervals(s1), [{ start: 0, end: 30 }, { start: 70, end: 100 }])

// a user split at 50 then remove 30–50 only
const s2 = removePiece(addSplit(base, 50), { start: 30, end: 50 })
assert.deepEqual(boundaries(addSplit(base, 50)), [0, 30, 50, 70, 100])
assert.equal(finalLength(s2), 80)
assert.deepEqual(keepIntervals(s2), [{ start: 0, end: 30 }, { start: 50, end: 100 }])

// addSplit ignores near-duplicate / near-boundary / out-of-range taps (0.2s epsilon)
assert.deepEqual(addSplit(base, 30.1).userSplits, []) // too close to item bound 30
assert.deepEqual(addSplit(base, 0).userSplits, [])     // at start
assert.deepEqual(addSplit(base, 100).userSplits, [])   // at end

// restorePiece reverses a removal
assert.deepEqual(keepIntervals(restorePiece(s1, { start: 30, end: 70 })), [{ start: 0, end: 100 }])

// trim handles shrink the kept window and drop removed ranges outside it
const s3 = setTrim(s1, 10, 90) // trim 0–10 and 90–100, on top of the 30–70 cut
assert.equal(finalLength(s3), 60) // (90-10) - 20-of-cut-inside? -> 80 - 40 = 40? verify below
assert.deepEqual(keepIntervals(s3), [{ start: 10, end: 30 }, { start: 70, end: 90 }])
assert.equal(finalLength(s3), 40)

console.log('timeline.test.ts: all assertions passed')
```

  (Note: the first `finalLength(s3)` assert above is intentionally corrected to 40 on the line after — delete the wrong `assert.equal(finalLength(s3), 60)` line when writing; keep only `=== 40`.)

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx tsx src/lib/video-editor/timeline.test.ts`
Expected: FAIL — `Cannot find module './timeline'`.

- [ ] **Step 3: Implement `timeline.ts`.**

```ts
// Pure, immutable cut-list model for the Review & Trim editor.
// Ported from docs/investigations/recorder-trim-mockup.html (the LOCKED interaction spec).
// One track + a list of removed ranges. keepIntervals() is the export contract.

export interface Range {
  start: number
  end: number
}

export interface TimelineState {
  /** Source duration in seconds. */
  duration: number
  /** Segment boundaries from the recorder's SPACE taps (item starts). Empty for plain uploads. */
  itemBounds: number[]
  /** User-added razor splits. */
  userSplits: number[]
  /** Removed pieces (each aligned to boundaries). */
  removed: Range[]
  /** Trim-in point (dead air at the head). */
  trimStart: number
  /** Trim-out point (dead air at the tail). */
  trimEnd: number
}

const EPS = 0.2

export function makeTimeline(duration: number, itemBounds: number[] = []): TimelineState {
  const bounds = [...new Set(itemBounds.filter((t) => t > 0 && t < duration))].sort((a, b) => a - b)
  return { duration, itemBounds: bounds, userSplits: [], removed: [], trimStart: 0, trimEnd: duration }
}

export function boundaries(s: TimelineState): number[] {
  return [...new Set([0, s.duration, ...s.itemBounds, ...s.userSplits])].sort((a, b) => a - b)
}

export function pieces(s: TimelineState): Range[] {
  const b = boundaries(s)
  const out: Range[] = []
  for (let i = 0; i < b.length - 1; i++) out.push({ start: b[i], end: b[i + 1] })
  return out
}

export function isRemoved(s: TimelineState, p: Range): boolean {
  return s.removed.some((r) => r.start <= p.start + 0.01 && r.end >= p.end - 0.01)
}

export function cutTotal(s: TimelineState): number {
  return s.removed.reduce((a, r) => a + (r.end - r.start), 0)
}

/** The ordered list of source-time ranges to KEEP: [trimStart,trimEnd] minus removed ranges. */
export function keepIntervals(s: TimelineState): Range[] {
  const cuts = s.removed
    .map((r) => ({ start: Math.max(r.start, s.trimStart), end: Math.min(r.end, s.trimEnd) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  const keep: Range[] = []
  let cursor = s.trimStart
  for (const c of cuts) {
    if (c.start > cursor) keep.push({ start: cursor, end: c.start })
    cursor = Math.max(cursor, c.end)
  }
  if (cursor < s.trimEnd) keep.push({ start: cursor, end: s.trimEnd })
  return keep
}

export function finalLength(s: TimelineState): number {
  return keepIntervals(s).reduce((a, r) => a + (r.end - r.start), 0)
}

export function addSplit(s: TimelineState, t: number): TimelineState {
  if (t <= 0 || t >= s.duration) return s
  const existing = [...s.userSplits, ...s.itemBounds]
  if (existing.some((x) => Math.abs(x - t) < EPS)) return s
  return { ...s, userSplits: [...s.userSplits, t].sort((a, b) => a - b) }
}

export function removePiece(s: TimelineState, p: Range): TimelineState {
  if (s.removed.some((r) => r.start === p.start && r.end === p.end)) return s
  return { ...s, removed: [...s.removed, { ...p }].sort((a, b) => a.start - b.start) }
}

export function restorePiece(s: TimelineState, p: Range): TimelineState {
  return { ...s, removed: s.removed.filter((r) => !(r.start <= p.start + 0.01 && r.end >= p.end - 0.01)) }
}

export function setTrim(s: TimelineState, start: number, end: number): TimelineState {
  const trimStart = Math.min(Math.max(0, start), end - 0.5)
  const trimEnd = Math.max(Math.min(s.duration, end), trimStart + 0.5)
  return { ...s, trimStart, trimEnd }
}
```

- [ ] **Step 4: Run it, watch it pass.**

Run: `npx tsx src/lib/video-editor/timeline.test.ts`
Expected: `timeline.test.ts: all assertions passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/video-editor/timeline.ts src/lib/video-editor/timeline.test.ts
git commit -m "feat(video-editor): pure immutable timeline cut-list model + tests"
```

---

## Task 2: Logo overlay draw util

**Files:** Create `src/lib/video-editor/logo.ts`

Zero-asset default: a styled **"Dealz" wordmark** drawn on the canvas (image-swappable later). Same function used by the live preview and the export encoder → identical output.

- [ ] **Step 1: Write `logo.ts`.**

```ts
// Logo overlay drawn onto the export/preview canvas. Text wordmark by default
// (no asset dependency); pass an HTMLImageElement to draw a real mark instead.
export type LogoCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface LogoConfig {
  enabled: boolean
  corner: LogoCorner
  /** Optional pre-loaded image; when absent a "Dealz" wordmark is drawn. */
  image?: CanvasImageSource | null
  text?: string
}

const MARGIN_RATIO = 0.04

export function drawLogo(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cfg: LogoConfig,
  w: number,
  h: number,
): void {
  if (!cfg.enabled) return
  const margin = Math.round(Math.min(w, h) * MARGIN_RATIO)

  if (cfg.image) {
    const iw = (cfg.image as HTMLImageElement).width || w * 0.18
    const ih = (cfg.image as HTMLImageElement).height || iw
    const scale = (w * 0.18) / iw
    const dw = iw * scale
    const dh = ih * scale
    const [x, y] = cornerXY(cfg.corner, w, h, dw, dh, margin)
    ctx.drawImage(cfg.image, x, y, dw, dh)
    return
  }

  const text = cfg.text ?? 'Dealz'
  const fontPx = Math.round(Math.min(w, h) * 0.055)
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  const metrics = ctx.measureText(text)
  const padX = Math.round(fontPx * 0.5)
  const padY = Math.round(fontPx * 0.32)
  const boxW = Math.ceil(metrics.width) + padX * 2
  const boxH = fontPx + padY * 2
  const [x, y] = cornerXY(cfg.corner, w, h, boxW, boxH, margin)

  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  roundRect(ctx, x, y, boxW, boxH, Math.round(fontPx * 0.28))
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x + padX, y + padY)
  ctx.restore()
}

function cornerXY(c: LogoCorner, w: number, h: number, dw: number, dh: number, m: number): [number, number] {
  const left = m
  const top = m
  const right = w - dw - m
  const bottom = h - dh - m
  switch (c) {
    case 'tl': return [left, top]
    case 'tr': return [right, top]
    case 'bl': return [left, bottom]
    case 'br': return [right, bottom]
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit` → 0 errors. Commit: `git add src/lib/video-editor/logo.ts && git commit -m "feat(video-editor): logo overlay draw util (Dealz wordmark, corner-configurable)"`

---

## Task 3: Export engine (MediaBunny, WebCodecs)

**Files:** Create `src/lib/video-editor/export-video.ts`

Uses the API pinned in Task 0. Decodes source video frames, keeps only `keepIntervals` (re-timestamped continuously so there are no gaps), draws each frame + logo onto a canvas, encodes H.264/AAC, muxes MP4. Audio samples copied the same way.

- [ ] **Step 1: Paste the confirmed MediaBunny symbol table** (from Task 0 Step 2) as a top-of-file comment, then implement. The structure below is the target; **reconcile method names with the Task 0 notes — docs win.**

```ts
import {
  Input, Output, ALL_FORMATS, BlobSource, BufferTarget,
  Mp4OutputFormat, CanvasSource, AudioBufferSource,
  VideoSampleSink, AudioBufferSink,
  QUALITY_HIGH,
} from 'mediabunny'
import type { Range } from './timeline'
import { drawLogo, type LogoConfig } from './logo'

export interface ExportOptions {
  source: Blob
  /** Ordered source-time ranges to keep (from keepIntervals()). */
  keep: Range[]
  logo: LogoConfig
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Total kept duration, for progress + timestamp mapping. */
function keptDuration(keep: Range[]): number {
  return keep.reduce((a, r) => a + (r.end - r.start), 0)
}

export async function exportEditedVideo(opts: ExportOptions): Promise<Blob> {
  const { source, keep, logo, onProgress, signal } = opts
  if (!('VideoEncoder' in globalThis)) {
    throw new Error('This browser cannot export video. Please use Chrome or Edge.')
  }
  if (keep.length === 0) throw new Error('Nothing to export — the whole clip is trimmed/cut.')

  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS })
  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) throw new Error('No video track found in the source file.')
  const audioTrack = await input.getPrimaryAudioTrack()

  const width = videoTrack.displayWidth ?? videoTrack.codedWidth
  const height = videoTrack.displayHeight ?? videoTrack.codedHeight

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
  output.addVideoTrack(videoSource)

  let audioSource: AudioBufferSource | null = null
  if (audioTrack) {
    audioSource = new AudioBufferSource({
      codec: 'aac',
      numberOfChannels: audioTrack.numberOfChannels,
      sampleRate: audioTrack.sampleRate,
    })
    output.addAudioTrack(audioSource)
  }

  await output.start()

  const total = keptDuration(keep)
  let outCursor = 0 // continuous output timeline (seconds)

  // ---- VIDEO ----
  const videoSink = new VideoSampleSink(videoTrack)
  for (const range of keep) {
    for await (const sample of videoSink.samples(range.start, range.end)) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      const outTs = outCursor + (sample.timestamp - range.start)
      ctx.clearRect(0, 0, width, height)
      sample.draw(ctx, 0, 0) // or drawImage(sample.toCanvasImageSource(), ...) per Task 0 notes
      drawLogo(ctx, logo, width, height)
      await videoSource.add(outTs, sample.duration)
      sample.close()
      onProgress?.(Math.min(0.98, (outTs / total) * (audioTrack ? 0.5 : 1)))
    }
    outCursor += range.end - range.start
  }
  videoSource.close()

  // ---- AUDIO ----
  if (audioTrack && audioSource) {
    const audioSink = new AudioBufferSink(audioTrack)
    let aCursor = 0
    for (const range of keep) {
      for await (const buf of audioSink.buffers(range.start, range.end)) {
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
        await audioSource.add(buf.buffer, aCursor)
        aCursor += buf.buffer.duration
        onProgress?.(Math.min(0.98, 0.5 + (aCursor / total) * 0.5))
      }
    }
    audioSource.close()
  }

  await output.finalize()
  onProgress?.(1)
  const bytes = (output.target as BufferTarget).buffer!
  return new Blob([bytes], { type: 'video/mp4' })
}
```

- [ ] **Step 2: Typecheck + reconcile.** Run: `npx tsc --noEmit`. Fix type errors against the real MediaBunny types (the Task 0 notes are authoritative for method names like `samples`/`buffers`/`add`/`draw`). The **algorithm** (keep-loop, `outCursor` re-timestamping, per-frame `drawLogo`) must not change.

- [ ] **Step 3: Barrel.** Create `src/lib/video-editor/index.ts`:

```ts
export * from './timeline'
export * from './logo'
export * from './export-video'
```

- [ ] **Step 4: Commit.** `git add src/lib/video-editor && git commit -m "feat(video-editor): WebCodecs/MediaBunny export engine (cuts skipped, logo burned in, audio preserved)"`

  (Full-clip export verification happens in the Task 8 Playwright E2E, which needs the real page.)

---

## Task 4: Review & Trim timeline component

**Files:** Create `src/components/video-editor/review-trim-timeline.tsx`

A faithful React port of `recorder-trim-mockup.html` (ruler + pieces + item boundaries + user splits + trim handles + playhead + zoom). Pure presentation over `TimelineState`; all edits go through the model via callbacks. Uses Tailwind + the app's existing dark tokens (the mockup's colors ARE the app's `.dark` oklch tokens).

- [ ] **Step 1: Implement the component.** Props:

```ts
import { useRef } from 'react'
import {
  boundaries, pieces, isRemoved, cutTotal, finalLength,
  type TimelineState, type Range,
} from '@/lib/video-editor/timeline'
import { cn } from '@/lib/utils'

interface ReviewTrimTimelineProps {
  state: TimelineState
  playhead: number
  zoom: number
  selected: Range | null
  onScrub: (t: number) => void
  onSelectPiece: (p: Range | null) => void
  onRestorePiece: (p: Range) => void
  onSetTrim: (start: number, end: number) => void
}
```

  Behaviour to replicate from the mockup (line refs):
  - **px/sec = `base * zoom`**, `base = max(6, containerWidth / duration)` so `zoom===1` fits (mockup line 204).
  - **Ruler ticks** densify with zoom: step `zoom>=8?1 : zoom>=4?2 : zoom>=2?5 : 10` seconds (line 151); label each tick `m:ss`.
  - **Pieces:** one div per `pieces(state)`; removed pieces get the red 45° hatch (`.removed`), others a neutral segment fill differentiated by lightness (map piece index → one of 4 neutral steps). Selected piece gets a ring. Click a removed piece → `onRestorePiece`; click a live piece → `onSelectPiece` (line 161-164).
  - **Item boundaries** rendered as labelled vertical lines with the item code tag (mockup line 167) — here just render a line per `state.itemBounds` (no code text unless provided). **User splits** as thin white lines (line 168).
  - **Trim veils + amber handles** at `trimStart`/`trimEnd`; dragging a handle calls `onSetTrim` (lines 169-172, 183-186). Left handle clamps to `trimEnd-0.5`, right to `trimStart+0.5`.
  - **Playhead** triangle + line at `playhead` (line 173-75); pointer-down on the ruler scrubs (`onScrub`, line 182).
  - **Readouts**: Original / Removed (`cutTotal`) / Final (`finalLength`) as `m:ss` (lines 174-177).
  - Horizontal scroll container; inner width = `duration * pps`.

  Use a `useRef` on the scroller to read `clientWidth` for `base`. Convert client-x→time with `(clientX - rect.left) / pps` clamped to `[0, duration]`. Keep it a controlled component — no internal edit state except drag bookkeeping.

- [ ] **Step 2: Typecheck.** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit.** `git add src/components/video-editor/review-trim-timeline.tsx && git commit -m "feat(video-editor): Review & Trim timeline UI (port of locked mockup)"`

---

## Task 5: Logo controls + editor shell

**Files:** Create `src/components/video-editor/logo-controls.tsx`, `src/components/video-editor/video-editor.tsx`, `src/components/video-editor/index.ts`

- [ ] **Step 1: `logo-controls.tsx`** — a small control row: a shadcn `Switch` (logo on/off) + a 2×2 corner picker (four `Button`s, `tl/tr/bl/br`, active one highlighted). Props: `value: LogoConfig`, `onChange: (c: LogoConfig) => void`.

- [ ] **Step 2: `video-editor.tsx`** — the shell that ties preview + timeline + controls + export. Props:

```ts
interface VideoEditorProps {
  source: Blob
  /** Optional recorder-provided item boundaries (seconds). Phase 1b passes these; uploads pass []. */
  itemBounds?: number[]
  /** Called with the finished MP4 to hand off to the page (upload + draft post). */
  onExport: (mp4: Blob) => Promise<void> | void
}
```

  Internal state + wiring:
  - On mount, create an object URL for `source`, load a hidden `<video>` to read `duration`, then `setState(makeTimeline(duration, itemBounds ?? []))`. Store `history: TimelineState[]` for undo (cap 50) — push before every mutating action.
  - Controls row: **▶ Play/⏸**, **✂ Split (S)**, **🗑 Remove (⌫)** (disabled unless a piece is selected), **↶ Undo** (disabled if history empty), **Zoom − / level / +** (`setZoom` clamps 1..16, `2×` steps).
  - Keyboard: `S` → `addSplit(state, playhead)`; `Backspace`/`Delete` → remove selected; guard when focus is in an input.
  - **Preview playback** mirrors the mockup's play loop (lines 200-203): drive `video.currentTime`; when the playhead enters a removed range, jump to its end; loop at `trimEnd` back to `trimStart`. Keep the `<video>` `currentTime` synced to `playhead` on scrub. Mute nothing (voiceover matters).
  - `<ReviewTrimTimeline state playhead zoom selected onScrub onSelectPiece onRestorePiece onSetTrim />`.
  - `<LogoControls value={logo} onChange={setLogo} />` (default `{ enabled: true, corner: 'br' }`).
  - **Export button** "Export & continue →": feature-detect `'VideoEncoder' in window` (else disabled with a "Use Chrome/Edge" tooltip); on click, `exportEditedVideo({ source, keep: keepIntervals(state), logo, onProgress: setProgress })`, show a determinate `Progress`, then `await onExport(mp4)`. Disable controls while exporting; surface errors via `toast.error`.

- [ ] **Step 3: Barrel** `index.ts`: `export * from './video-editor'; export * from './review-trim-timeline'; export * from './logo-controls'`.

- [ ] **Step 4: Typecheck + build.** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(video-editor): editor shell (preview playback, controls, undo, logo, export handoff)`.

---

## Task 6: `social-media` storage bucket

**Files:** Create `supabase/migrations/20260708150000_social_media_bucket.sql`

Exported MP4s need a **public** home (Blotato consumes public URLs). No existing bucket fits; create one. Pattern mirrors `supabase/migrations/20260210000002_rls_and_storage.sql` (line 102+).

- [ ] **Step 1: Write the migration.**

```sql
-- Public bucket for exported marketing videos (Blotato consumes public URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (Blotato + browsers).
CREATE POLICY "Public read social-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-media');

-- Authenticated staff can upload/update/delete.
CREATE POLICY "Staff write social-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-media');
CREATE POLICY "Staff update social-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'social-media');
CREATE POLICY "Staff delete social-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-media');
```

- [ ] **Step 2: Apply.** `supabase db push`. Verify: `supabase db query --linked "select id, public from storage.buckets where id='social-media'"` → `public: true`.

- [ ] **Step 3: Commit.** `git add supabase/migrations/20260708150000_social_media_bucket.sql && git commit -m "feat(video-editor): public social-media storage bucket for exported videos"`

---

## Task 7: Editor page + route + nav + entry

**Files:** Create `src/pages/admin/video-editor.tsx`; modify `src/routes.tsx`, `src/components/layout/sidebar.tsx`, `src/pages/admin/social-media.tsx`

- [ ] **Step 1: Page `video-editor.tsx`.**
  - State machine: `pick` (drag/drop or `<input type=file accept="video/*">`) → `edit` (`<VideoEditor source onExport>`).
  - `onExport(mp4)`: upload **directly** (do NOT use `uploadMedia` — it strips audio + square-crops via ffmpeg). Then create a draft post:

```ts
import { supabase } from '@/lib/supabase'
import { createSocialMediaPost } from '@/services/social-media-posts'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

async function handleExport(mp4: Blob) {
  const id = crypto.randomUUID()
  const path = `exports/${id}.mp4`
  const up = await supabase.storage.from('social-media').upload(path, mp4, {
    contentType: 'video/mp4', upsert: false,
  })
  if (up.error) { toast.error(`Upload failed: ${up.error.message}`); return }
  const { data: pub } = supabase.storage.from('social-media').getPublicUrl(path)

  await createSocialMediaPost({
    media_urls: [pub.publicUrl],
    post_type: 'video',
    platform: 'facebook',
    status: 'draft',            // NEVER queued from here — team sets target + queues on Social Media page
  })
  toast.success('Video exported — draft post created on Social Media.')
  navigate('/admin/social-media')
}
```

  (`account_id`/`page_id`/`schedule_type` fall to the table defaults = the real Dealz FB page + `next_slot`. `SocialMediaPostInsert` already makes these optional; confirm the `post_type`/`status`/`media_urls` fields exist on the type — add `post_type?: string` to `SocialMediaPostInsert` in `src/lib/types.ts` if missing.)

- [ ] **Step 2: Route** in `src/routes.tsx`: add `const VideoEditorPage = lazy(() => import('@/pages/admin/video-editor'))` beside the other admin lazies, and a child route `{ path: 'video-editor', element: adminElement(VideoEditorPage) }` next to the `shoots`/`social-media` routes (match the exact `adminElement(...)` wrapper used there — grep the `social-media` route line and mirror it).

- [ ] **Step 3: Nav** in `src/components/layout/sidebar.tsx` (array around line 103): add `{ title: 'Video Editor', href: '/admin/video-editor', icon: Scissors }` right after the Shoots entry. Import `Scissors` from `lucide-react`.

- [ ] **Step 4: Entry button** on `src/pages/admin/social-media.tsx`: add a "Trim & post a video" `Button` (icon `Scissors`, `variant="outline"`) in the header action row that does `navigate('/admin/video-editor')`.

- [ ] **Step 5: Typecheck + build.** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(video-editor): editor page + route + nav + Social Media entry (export→upload→draft post)`.

---

## Task 8: E2E verification + ship

**Files:** Create `e2e/video-editor.spec.ts`; modify `package.json`, `docs/PROJECT_STATE.md`, memory.

- [ ] **Step 1: Playwright happy path.** Using the dev-staff login (`reference_dev_staff_login` memory / `.env.local`), a fixture MP4 (`e2e/fixtures/testsrc.mp4` from Task 0, keep it), in **Chromium**:
  1. Login → `/admin/video-editor`.
  2. Upload the fixture → editor mounts, readout shows `Original 0:05`.
  3. Scrub to ~1s → Split (S); scrub to ~3s → Split; click the middle piece → Remove; assert `Final length` drops to ~0:03.
  4. Click "Export & continue →"; wait for progress→done; assert redirect to `/admin/social-media` and a toast/`draft` card appears.
  5. Assert (via Supabase) the newest `social_media_posts` row is `status='draft'`, `post_type='video'`, `media_urls[0]` under the `social-media` bucket. Then delete that test row + the uploaded object.

Run: `npx playwright test e2e/video-editor.spec.ts` → PASS. (If the runner is headless-Chromium, confirm WebCodecs is enabled; else run `--headed`.)

- [ ] **Step 2: Manual smoke (real clip).** Open the app in Chrome, upload a real portrait phone video **with sound + voiceover**, remove a middle section, export, and play the resulting draft's video: confirm (a) audio is present and in sync, (b) the removed section is gone, (c) the Dealz logo is burned into the chosen corner, (d) aspect ratio preserved (NOT square-cropped). Record the result in the commit body.

- [ ] **Step 3: Ship.** Bump `package.json` **1.95.0 → 1.96.0** (once this session). Update `docs/PROJECT_STATE.md` (Now → "Video editor Phase 1a shipped"; note recorder Phase 1b is next). Update the `project_social_video_marketing_automation` memory (Phase 1a editor built + shipped; recorder still deferred). Then run the `push-to-main` skill.

```bash
# after version bump + doc/memory updates
git add -A && git commit -m "feat(video-editor): Review & Trim editor Phase 1a — trim/cut + WebCodecs export + draft post (v1.96.0)"
# then: push-to-main skill
```

---

## Self-Review (against the spec)

- **LOCKED mockup fidelity:** Task 4 ports every interaction — razor/split (S), remove piece (⌫), zoom px/sec with densifying ticks, amber trim handles, playhead scrub, undo, readouts. ✅
- **"cuts skipped" export:** `keepIntervals` (Task 1, tested) → `exportEditedVideo` re-timestamps continuously (Task 3). ✅
- **Logo now, music later:** Task 2 + logo-controls + burned into export (Task 3/5). Music bed explicitly deferred (stated in Architecture + File Structure). ✅
- **WebCodecs/MediaBunny, $0:** Task 0 pins the API + de-risks; Task 3 implements. Chromium-only handled by feature-detection (Task 5) + a browser-constraint box. ✅
- **Closes "post a finished video":** Task 7 uploads to a public bucket (Task 6) + creates a `draft` post → existing "Process Queue" publishes. No new publish path; draft-only safety. ✅
- **Recorder handoff ready:** `TimelineState.itemBounds` + `VideoEditorProps.itemBounds` exist now so Phase 1b's SPACE taps drop in with no model change. ✅
- **Doesn't wreck the export:** upload bypasses `uploadMedia`/`tryProcessVideo` (which strips audio + square-crops). ✅

**Type consistency:** `Range`/`TimelineState` shared across timeline↔export↔UI; `keepIntervals(): Range[]` is the single export contract; `LogoConfig` shared logo↔controls↔export; `exportEditedVideo(ExportOptions)` matches the shell's call. Draft insert uses only defaulted/optional `social_media_posts` columns.

**Open risk (surface if hit):** exact MediaBunny method names (`samples`/`buffers`/`add`/`draw`/`QUALITY_HIGH`) — Task 0 verifies them against live docs before Task 3 hardens. If MediaBunny audio copy is genuinely blocked, STOP and report rather than shipping silent exports.
```
