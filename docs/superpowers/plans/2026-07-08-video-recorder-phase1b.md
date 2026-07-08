# SPACE-Advance Recorder (Product Mode) — Phase 1b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bespoke in-house **SPACE-advance recorder**: preselect item codes → hit record → a canvas composites a **data-driven product overlay card** (from `getClaimableByCode`) + a live **camera PiP** → press **SPACE** (or "Next ▶") to advance the overlay to the next item, recording a segment boundary at each press → stop → hand the one continuous take (blob + `itemBounds`) straight into the **existing Phase 1a `VideoEditor`** for trim/cut/logo/export → draft post. One take, self-labeling segments, no cross-clip sync problem.

**Architecture:** Reuse everything Phase 1a built. The recorder produces `(Blob, itemBounds: number[])` and mounts the **existing** `<VideoEditor source itemBounds onExport>` — the editor already accepts `itemBounds` (the recorder seam was built in Phase 1a) and already does export→upload→draft. New pieces are contained: (1) a pure **overlay-card renderer** (`draw` on a canvas, data-driven — matches "the overlay is data, not design"); (2) a **compositor** that draws hero image + camera PiP + card each frame; (3) a **recorder component** (getUserMedia + `canvas.captureStream()` + mic → combined `MediaStream` → `MediaRecorder`, SPACE-advance, segment timestamps); (4) the **video-editor page** gains a "Record" mode (and a `?shoot=` entry that preloads a shoot's codes). Product mode only (scene presets deferred, confirmed w/ Joey). Overlay = data-driven canvas card (confirmed w/ Joey).

**Tech Stack:** React 18 + Vite + TS; `getUserMedia`/`MediaRecorder` (reuse `src/lib/media-recording.ts` constants + `pickSupportedMimeType`); `canvas.captureStream(30)` + `new MediaStream([...video, ...audio])`; `getClaimableByCode` (`src/services/mine.ts`, handles P/G/A/B) for overlay data; existing `VideoEditor` + MediaBunny export (Phase 1a). Unit tests: `node:assert/strict` via `npx tsx`. UI/record: Playwright MCP (real Chromium; use `--use-fake-device-for-media-stream` fake camera). Source: `docs/investigations/2026-07-03-social-video-marketing-automation.md` (SPACE-advance insight), plan `docs/superpowers/plans/2026-07-08-video-editor-phase1.md` (Phase 1a).

> ### ⚠️ Two real risks — spike FIRST (Task 0)
> 1. **MediaRecorder-webm duration metadata:** Chrome's `MediaRecorder` webm blobs often report `video.duration = Infinity` until fully seeked → the editor's `makeTimeline(video.duration, …)` would break. Mitigation baked in: the recorder measures its own duration (`performance.now()` delta) and passes it as a `durationHint` to `VideoEditor`.
> 2. **Canvas taint from cross-origin hero images:** drawing a Supabase-public image onto the canvas without CORS → the canvas is tainted → `captureStream()`/export throws a SecurityError. Mitigation: load hero images with `img.crossOrigin = 'anonymous'` (Supabase public objects send `Access-Control-Allow-Origin: *`). The spike MUST prove a tainted-free record→export.

> ### 🔒 Safety (unchanged from Phase 1a)
> The recorder feeds the editor, which only ever creates **`draft`** posts. Nothing here publishes. Chromium-only (feature-detected).

---

## File Structure

**New — pure logic (`src/lib/video-recorder/`)**
- Create: `src/lib/video-recorder/types.ts` — `RecorderCard`, `RecorderLayout`.
- Create: `src/lib/video-recorder/overlay.ts` — `drawOverlayCard(ctx, card, w, h, layout)` (data-driven card) + `computeItemBounds(spaceTimestamps)`.
- Create: `src/lib/video-recorder/overlay.test.ts` — unit tests for `computeItemBounds` (pure).
- Create: `src/lib/video-recorder/compositor.ts` — `compositeFrame(ctx, { hero, camera, card, w, h, layout })` (one frame: hero full-bleed + camera PiP + card).
- Create: `src/lib/video-recorder/index.ts` — barrel.

**New — React (`src/components/video-recorder/`)**
- Create: `src/components/video-recorder/recorder.tsx` — the recorder shell (setup → record → onComplete).
- Create: `src/components/video-recorder/code-strip.tsx` — the preselected-codes strip (chips + current highlight + add/remove).
- Create: `src/components/video-recorder/index.ts` — barrel.

**Modify — reuse Phase 1a**
- Modify: `src/components/video-editor/video-editor.tsx` — add optional `durationHint?: number` prop (use when `video.duration` isn't finite).
- Modify: `src/pages/admin/video-editor.tsx` — add a "Record" mode + `?shoot=`/`?mode=record` entry; recorder `onComplete` → mount `<VideoEditor>`.
- Modify: `src/components/shoots/shoot-card.tsx` — add a "Record" action → `/admin/video-editor?shoot=<id>&mode=record`.
- Modify: `src/services/shoots.ts` — add `getShoot(id)` if absent (to load a shoot's `item_codes` on the editor page).

**Deferred (Phase 1c+):** scene presets ([1] camera-full, [2] image-full, [3] slide+cam PiP for info/guide videos), music bed, evergreen library.

---

## Task 0: Spike — canvas+mic record → MediaBunny export (de-risk webm duration + canvas taint)

**Files:** throwaway `/tmp/recspike/` (outside repo) driven by the Playwright MCP.

- [ ] **Step 1: Build a standalone spike page** that: creates a portrait `OffscreenCanvas`/`<canvas>` (720×1280), loads a **Supabase-public product image** with `img.crossOrigin='anonymous'`, runs a ~2s rAF loop drawing the image full-bleed + a filled rounded "card" rectangle + a moving box (fake camera), records `new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...(await getUserMedia({audio:true... or a silent oscillator})).getAudioTracks()])` via `MediaRecorder`, stops, then feeds the recorded blob into MediaBunny (`https://esm.sh/mediabunny@1.50.7`) and re-exports an MP4 keeping `[0,1]` (skipping the rest). Report: `recordedBytes`, `recordedMime`, `mediaBunnyDuration`, `exportedBytes`, `exportPlayableDuration`, and `taintError` (should be none).

- [ ] **Step 2: Drive it in real Chromium via the Playwright MCP** with a fake camera: the MCP browser must launch with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (if the MCP's Chromium lacks these, use a silent `AudioContext` oscillator for the audio track and skip camera in the spike — the camera is proven separately by the existing `media-recorder-panel.tsx`). Navigate, wait for `window.__recspike`, assert: `taintError` is falsy (CORS OK), `exportPlayableDuration` ≈ 1s (cut applied), `exportedBytes` > 0.

- [ ] **Step 3: Record the findings** (webm mime, whether `<video>.duration` was Infinity for the recorded blob, whether MediaBunny computed a correct duration) as a comment block for Task 4. **If canvas taint occurs**, STOP and report — the whole approach depends on CORS-clean hero draws. **If MediaBunny can't read a MediaRecorder-webm at all**, STOP and report (fallback: record via `MediaRecorder` in `video/mp4` where supported, or transcode).

- [ ] **Step 4: Delete the spike.** No dep changes (mediabunny already installed). Nothing to commit (spike is in /tmp) — proceed to Task 1.

---

## Task 1: Types + `computeItemBounds` (pure, TDD)

**Files:** Create `src/lib/video-recorder/types.ts`, `src/lib/video-recorder/overlay.ts` (bounds fn only here; draw fn in Task 2), `src/lib/video-recorder/overlay.test.ts`

- [ ] **Step 1: Write `types.ts`.**

```ts
export interface RecorderCard {
  code: string
  title: string
  subtitle?: string | null
  grade?: string | null
  price: number
  originalPrice?: number | null
  conditionNotes?: string | null
  /** Pre-loaded, CORS-clean hero image (or null → solid background). */
  hero?: HTMLImageElement | null
}

export type PipCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface RecorderLayout {
  pipCorner: PipCorner
  /** PiP width as a fraction of canvas width (e.g. 0.3). */
  pipScale: number
}
```

- [ ] **Step 2: Write the failing test** (`overlay.test.ts`) for the bounds helper.

```ts
import assert from 'node:assert/strict'
import { computeItemBounds } from './overlay'

// SPACE pressed at 4.2s and 9.8s during a 14s take → item boundaries at those times.
assert.deepEqual(computeItemBounds([4.2, 9.8], 14), [4.2, 9.8])
// out-of-range / non-increasing taps are dropped; 0 and duration are never bounds
assert.deepEqual(computeItemBounds([0, 4.2, 4.2, 20, 9.8], 14), [4.2, 9.8])
assert.deepEqual(computeItemBounds([], 14), [])
console.log('overlay.test.ts: all assertions passed')
```

- [ ] **Step 3: Run → fail.** `npx tsx src/lib/video-recorder/overlay.test.ts` → FAIL (no `computeItemBounds`).

- [ ] **Step 4: Implement `computeItemBounds` in `overlay.ts`** (the draw fn is added in Task 2).

```ts
import type { RecorderCard, RecorderLayout } from './types'

/** SPACE-press timestamps → sorted, de-duped, in-range (0,duration) item boundaries. */
export function computeItemBounds(spaceTimestamps: number[], duration: number): number[] {
  return [...new Set(spaceTimestamps.filter((t) => t > 0 && t < duration))].sort((a, b) => a - b)
}
```

- [ ] **Step 5: Run → pass.** `npx tsx src/lib/video-recorder/overlay.test.ts` → `all assertions passed`. Commit: `feat(video-recorder): recorder types + computeItemBounds (pure) + test`.

---

## Task 2: Overlay card renderer + compositor

**Files:** Modify `src/lib/video-recorder/overlay.ts` (add `drawOverlayCard`); Create `src/lib/video-recorder/compositor.ts`, `src/lib/video-recorder/index.ts`

- [ ] **Step 1: Add `drawOverlayCard`** to `overlay.ts` — a data-driven lower-third card (title, price, strike-through original, grade chip, condition note). Portrait-friendly. Pure (takes ctx + card + dims).

```ts
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function yen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('en-US')
}

/** Data-driven product card, drawn as a lower-third band. */
export function drawOverlayCard(ctx: Ctx2D, card: RecorderCard, w: number, h: number): void {
  const pad = Math.round(w * 0.045)
  const bandH = Math.round(h * 0.22)
  const y = h - bandH
  // scrim
  const grad = ctx.createLinearGradient(0, y - bandH * 0.4, 0, h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = grad
  ctx.fillRect(0, y - bandH * 0.4, w, bandH * 1.4)

  const titlePx = Math.round(w * 0.052)
  ctx.font = `700 ${titlePx}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.fillText(card.title, pad, y + pad, w - pad * 2)

  // code chip (top-right of band)
  const chipPx = Math.round(w * 0.032)
  ctx.font = `600 ${chipPx}px ui-monospace, monospace`
  const chipW = ctx.measureText(card.code).width + chipPx
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  roundRect(ctx, w - pad - chipW, y + pad, chipW, chipPx * 1.7, chipPx * 0.4)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(card.code, w - pad - chipW + chipPx * 0.5, y + pad + chipPx * 0.35)

  // price row
  const priceY = y + pad + titlePx * 1.5
  const pricePx = Math.round(w * 0.06)
  ctx.font = `800 ${pricePx}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  ctx.fillText(yen(card.price), pad, priceY)
  const priceW = ctx.measureText(yen(card.price)).width
  if (card.originalPrice && card.originalPrice > card.price) {
    const oPx = Math.round(w * 0.036)
    ctx.font = `500 ${oPx}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    const ox = pad + priceW + pricePx * 0.4
    const ow = ctx.measureText(yen(card.originalPrice)).width
    ctx.fillText(yen(card.originalPrice), ox, priceY + pricePx * 0.35)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = Math.max(1, oPx * 0.06)
    ctx.beginPath()
    ctx.moveTo(ox, priceY + pricePx * 0.35 + oPx * 0.55)
    ctx.lineTo(ox + ow, priceY + pricePx * 0.35 + oPx * 0.55)
    ctx.stroke()
  }
  // grade chip
  if (card.grade) {
    const gPx = Math.round(w * 0.034)
    ctx.font = `700 ${gPx}px Inter, system-ui, sans-serif`
    const label = `Grade ${card.grade}`
    const gw = ctx.measureText(label).width + gPx
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    roundRect(ctx, w - pad - gw, priceY + pricePx * 0.1, gw, gPx * 1.7, gPx * 0.4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, w - pad - gw + gPx * 0.5, priceY + pricePx * 0.1 + gPx * 0.35)
  }
}
```

- [ ] **Step 2: Write `compositor.ts`.**

```ts
import type { RecorderCard, RecorderLayout } from './types'
import { drawOverlayCard } from './overlay'

export interface CompositeInput {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  w: number
  h: number
  card: RecorderCard
  camera: HTMLVideoElement | null
  layout: RecorderLayout
}

/** Draw one composited frame: hero full-bleed (cover) → camera PiP → overlay card. */
export function compositeFrame({ ctx, w, h, card, camera, layout }: CompositeInput): void {
  // Background: hero image (cover) or solid.
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, w, h)
  if (card.hero && card.hero.complete && card.hero.naturalWidth > 0) {
    drawCover(ctx, card.hero, card.hero.naturalWidth, card.hero.naturalHeight, w, h)
  }
  // Camera PiP.
  if (camera && camera.readyState >= 2 && camera.videoWidth > 0) {
    const pipW = Math.round(w * layout.pipScale)
    const pipH = Math.round(pipW * (camera.videoHeight / camera.videoWidth))
    const m = Math.round(w * 0.03)
    const x = layout.pipCorner.includes('r') ? w - pipW - m : m
    const y = layout.pipCorner.includes('b') ? h - pipH - m * 4 : m
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = Math.max(2, w * 0.004)
    roundRectPath(ctx, x, y, pipW, pipH, pipW * 0.06)
    ctx.clip()
    ctx.drawImage(camera, x, y, pipW, pipH)
    ctx.restore()
    roundRectPath(ctx, x, y, pipW, pipH, pipW * 0.06)
    ctx.stroke()
  }
  drawOverlayCard(ctx, card, w, h)
}

function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource, iw: number, ih: number, w: number, h: number,
): void {
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function roundRectPath(
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

- [ ] **Step 3: Barrel** `index.ts`: `export * from './types'; export * from './overlay'; export * from './compositor'`.

- [ ] **Step 4: Typecheck.** `npx tsc --noEmit` → 0 errors. Commit: `feat(video-recorder): data-driven overlay card renderer + frame compositor`.

---

## Task 3: `durationHint` on VideoEditor

**Files:** Modify `src/components/video-editor/video-editor.tsx`

- [ ] **Step 1:** Add `durationHint?: number` to `VideoEditorProps`. In `handleLoadedMetadata`, when `!Number.isFinite(v.duration)` (MediaRecorder-webm case), fall back to `durationHint` if provided:

```ts
const handleLoadedMetadata = useCallback(() => {
  const v = videoRef.current
  if (!v) return
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (durationHint ?? 0)
  if (dur <= 0) return
  setState(makeTimeline(dur, itemBounds ?? []))
}, [itemBounds, durationHint])
```

- [ ] **Step 2: Typecheck + build.** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(video-editor): durationHint fallback for MediaRecorder blobs (Infinity duration)`.

---

## Task 4: Recorder component

**Files:** Create `src/components/video-recorder/recorder.tsx`, `src/components/video-recorder/code-strip.tsx`, `src/components/video-recorder/index.ts`

- [ ] **Step 1: `code-strip.tsx`** — renders the preselected codes as chips; the active index is highlighted; shows "next" hint. Props: `codes: string[]`, `activeIndex: number`, `titles: Record<string, string>`.

- [ ] **Step 2: `recorder.tsx`** — the recorder shell. Props:

```ts
interface RecorderProps {
  codes: string[]
  onComplete: (blob: Blob, itemBounds: number[], durationSec: number, firstCode: string | null) => void
  onCancel: () => void
}
```

  Behaviour (reuse `media-recording.ts` + spike findings):
  - **Load cards:** for each code call `getClaimableByCode(code)` → build `RecorderCard[]` (title, subtitle, grade, price, originalPrice, conditionNotes). Preload each `hero` from `card.media[0]?.url` as `new Image()` with `img.crossOrigin = 'anonymous'` (CORS-clean — spike-proven). Skip codes that resolve null (toast a warning).
  - **Camera:** `getUserMedia({ audio: true, video: VIDEO_CONSTRAINTS })`; attach to a hidden `<video>` (muted, autoplay, playsInline). Feature-detect + graceful error (mirror `media-recorder-panel.tsx`).
  - **Canvas:** portrait `<canvas>` 720×1280 (preview) — record at that size. rAF loop calls `compositeFrame({ ctx, w, h, card: cards[activeIndex], camera: videoEl, layout })`.
  - **Record:** `const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...micStream.getAudioTracks()])`; `mime = pickSupportedMimeType('video')`; `new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 })`; collect chunks; `recorder.start(1000)`. Record `startedAt = performance.now()`.
  - **SPACE-advance:** on `keydown` `' '`/`Spacebar` (and a "Next item ▶" button): if `activeIndex < codes.length-1`, push `(performance.now()-startedAt)/1000` to `spaceTimes`, `activeIndex++`. Ignore when not recording.
  - **Stop:** `recorder.stop()`; onstop → `blob = new Blob(chunks, {type: mime.mimeType})`; `durationSec = (performance.now()-startedAt)/1000`; `itemBounds = computeItemBounds(spaceTimes, durationSec)`; stop all tracks; `onComplete(blob, itemBounds, durationSec, codes[0] ?? null)`.
  - **UI:** live canvas preview (portrait, centered), the `<CodeStrip>`, a REC timer, big **Start / ● REC → Next item ▶ / ■ Stop** controls, and Cancel. Show "item k of N".
  - Full teardown on unmount (stop tracks, cancel rAF, revoke).

- [ ] **Step 3: Barrel** `index.ts`: `export * from './recorder'; export * from './code-strip'`.

- [ ] **Step 4: Typecheck + build.** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(video-recorder): SPACE-advance canvas recorder (overlay card + camera PiP, combined stream, segment timestamps)`.

---

## Task 5: Wire Record mode into the editor page + shoot entry

**Files:** Modify `src/pages/admin/video-editor.tsx`, `src/components/shoots/shoot-card.tsx`, `src/services/shoots.ts`

- [ ] **Step 1: `getShoot(id)`** in `services/shoots.ts` if absent — `select('*').eq('id', id).single()` returning the row (need `item_codes`). (Grep first; reuse if present.)

- [ ] **Step 2: Editor page modes.** Extend `video-editor.tsx` state to `'pick' | 'record' | 'edit'`:
  - Read `useSearchParams()`: `mode=record` and/or `shoot=<id>`.
  - On mount, if `shoot` present → `getShoot(id)` → `codes = shoot.item_codes`; if `mode=record` (or a shoot is present) → go to `'record'`.
  - `'pick'` screen: the existing dropzone **plus** a "Record a live-selling video" button (+ optional manual code entry) → `'record'`.
  - `'record'`: `<Recorder codes={codes} onCancel={() => setMode('pick')} onComplete={(blob, bounds, dur) => { setSource(blob); setItemBounds(bounds); setDurationHint(dur); setMode('edit') }} />`.
  - `'edit'`: `<VideoEditor source={source} itemBounds={itemBounds} durationHint={durationHint} onExport={handleExport} />` (unchanged handler).

- [ ] **Step 3: Shoot "Record" action.** In `shoot-card.tsx`, add a small `Video`/`Clapperboard` icon button → `navigate('/admin/video-editor?shoot=' + shoot.id + '&mode=record')`. (Import `useNavigate`.)

- [ ] **Step 4: Typecheck + build.** `npx tsc --noEmit && npm run build` → clean. Commit: `feat(video-recorder): Record mode + ?shoot= entry on the editor page; Record action on shoot cards`.

---

## Task 6: E2E verification + ship

**Files:** Playwright MCP session; modify `package.json`, `docs/PROJECT_STATE.md`, memory.

- [ ] **Step 1: E2E (Playwright MCP, real Chromium w/ fake camera).** The MCP Chromium should run with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (fake camera + auto-granted permission). Flow: login → open a Shoot with ≥2 real codes → "Record" → recorder loads cards (assert titles/prices drawn), grant camera (fake) → Start → wait ~2s → "Next item ▶" → wait ~2s → Stop → transitions to the editor with `Original ≈ 0:04` and **item boundary lines visible** on the timeline → Export → `draft` post created → probe MP4 (H.264+AAC, playable). Clean up the test post + object.
  - If the MCP Chromium can't do a fake camera, verify the **compositor + card rendering** headlessly (unit-render `compositeFrame` to an `OffscreenCanvas`, assert non-blank pixels) and do the record→edit→export leg manually; document which path was used.

- [ ] **Step 2: Manual smoke.** Real Chrome, real camera: record 2 real codes with voiceover, SPACE between them, stop → confirm the overlay card shows correct title/price per item, camera PiP is visible, item boundaries land at the SPACE points, export plays with audio. Record the result in the commit body.

- [ ] **Step 3: Ship.** Bump `package.json` **1.96.0 → 1.97.0**. Update `docs/PROJECT_STATE.md` (Now → "Recorder Phase 1b shipped"; Phase 1 complete). Update `project_social_video_marketing_automation` memory (recorder built; scene presets/music/evergreen deferred to 1c+). Run `push-to-main` (fast-forward `main`).

---

## Self-Review (against the spec)

- **SPACE-advance one take:** Task 4 — canvas compositor + combined stream + `MediaRecorder`; SPACE pushes segment timestamps; `computeItemBounds` (Task 1, tested) → `itemBounds`. ✅
- **Data-driven overlay (confirmed decision):** Task 2 `drawOverlayCard` from `getClaimableByCode` data — no DOM screenshot, no design duplication. ✅
- **Product mode only (confirmed decision):** hero + camera PiP + card; scene presets explicitly deferred. ✅
- **Feeds the existing editor:** Task 5 mounts the Phase 1a `<VideoEditor>` with `source + itemBounds + durationHint`; export→draft path unchanged. ✅
- **Preselect from a Shoot:** Task 5 `?shoot=` → `getShoot` → `item_codes`; "Record" action on shoot cards. ✅
- **Risks retired first:** Task 0 spikes canvas-taint (CORS hero) + MediaRecorder-webm duration (→ `durationHint`, Task 3). ✅

**Type consistency:** `RecorderCard`/`RecorderLayout` shared overlay↔compositor↔recorder; `computeItemBounds(number[], number): number[]` feeds `VideoEditor.itemBounds`; `onComplete(blob, itemBounds, durationSec, firstCode)` matches the page handler; `durationHint` threaded recorder→page→editor. Overlay data via `getClaimableByCode` (existing, handles P/G/A/B).

**Open risk (surface if hit):** if the Playwright-MCP Chromium can't fake a camera, the record leg's automated E2E degrades to a headless compositor pixel check + manual smoke (documented in Task 6 Step 1). And if MediaRecorder can only emit webm that MediaBunny mis-times, the `durationHint` covers the editor UI while the export re-timestamps continuously (Phase 1a export already ignores source timestamps beyond the keep-ranges).
```
