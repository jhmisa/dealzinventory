# Content Studio — Phase 3 Implementation Plan (Video flow)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]`.

**Phase 3 goal:** Wire the video flow into the studio. **Export-to-Library** (recorded/edited videos land in `content_items`), the **recorder layout switcher + Retake + locked shortcuts** (the Paper mock), **New Shoot dialog** polish, and an **editor scene-segmented timeline**. Music **auto-duck** and **Video Templates** are deferred to **Phase 3b** to protect the `export-video.ts` A/V-sync contract and keep this pass verifiable.

**Architecture:** The recorder bakes the chosen layout into its canvas output per-frame — layout switching lives entirely in the recorder/compositor and does NOT touch `export-video.ts` (no A/V risk). Export gains a `content_items` insert so videos appear in the Library. Layout region math + retake trimming + scene-colour mapping are pure + unit-tested; camera compositing is flagged for a real-webcam check (headless can't drive a real camera — see PROJECT_STATE F2 gotcha).

**Safety invariants:** app's shadcn/Tailwind theme; atomic commits + PROJECT_STATE per commit; `tsc` green + `tsx` on new tests before commit; **do NOT modify `export-video.ts`'s audio path** (auto-duck deferred); never enable publish-due cron / content_publisher_enabled; never push main.

---

## Task 1 — Export-to-Library (record → Library)

**Files:** modify `src/pages/admin/video-editor.tsx` (handleExport), add `src/services/content-items.ts` usage.

- [ ] **1.1** In `handleExport`, after the `social-media` upload + `createSocialMediaPost` succeeds, also insert a `content_items` row: `{ kind:'video', title: firstCode ? \`${firstCode} video\` : \`Recorded ${date}\`, media_urls:[publicUrl], item_codes: codes.length?codes:null, orientation, duration_sec: durationHint ?? null, source:'recorder', shoot_id: shootId ?? null }`. Use `createContentItem` from `@/services/content-items`. Non-fatal try/catch (don't block the draft). Toast: "Video exported — added to your Library."
- [ ] **1.2** Redirect to `/admin/content-studio?tab=library` instead of `/admin/recorded-videos`.
- [ ] **1.3** `tsc`. Commit `feat(content-studio): export video to Library (content_items on export)`.

## Task 2 — New Shoot dialog polish (already embeds InventoryPicker)

**Files:** `src/components/shoots/shoot-form-dialog.tsx`.

- [ ] **2.1** Verify fields match Paper: title/assignee/orientation/item-codes(InventoryPicker + chips)/notes. Add a footer helper line under the codes: "N items · they travel into Record in this order." (reads `codes.length`). Keep everything else.
- [ ] **2.2** `tsc`. Commit `feat(content-studio): New Shoot dialog — codes-travel-in-order helper`.

## Task 3 — Editor scene-segmented timeline

**Files:** add `src/lib/video-editor/scene-colors.ts` (+ test); modify `src/components/video-editor/review-trim-timeline.tsx`.

- [ ] **3.1** `scene-colors.ts` pure: `sceneIndexOf(pieceStart: number, itemBounds: number[]): number` (count of bounds <= pieceStart) and `SCENE_FILLS: string[]` (reuse existing SEG_FILLS palette). + `scene-colors.test.ts` — assert a piece before first bound = 0, after first = 1, etc. Run `npx tsx`.
- [ ] **3.2** In `ReviewTrimTimeline`, colour each non-removed piece by `SCENE_FILLS[sceneIndexOf(piece.start, state.itemBounds) % n]`; draw faint scene-divider lines at each `itemBounds` position. Keep removed-piece hatch as-is.
- [ ] **3.3** `tsc`. Commit `feat(content-studio): editor scene-segmented timeline (colour per item boundary)`.

## Task 4 — Recorder layout presets + Retake + locked shortcuts (the Paper mock)

**Files:** add `src/lib/video-recorder/layout-presets.ts` (+ test); modify `types.ts`, `compositor.ts`, `recorder.tsx`.

- [ ] **4.1** `layout-presets.ts` pure: `type LayoutPreset = 'talking-head'|'specs-inset'|'product-showcase'`; `regionsFor(orientation, preset, dims): { product: Rect; specs: Rect; cameraBox: Rect }`. `product-showcase` = today's rects (from ORIENTATION_DIMS). `talking-head` = camera FULL-frame, product a small lower-third chip, specs over camera bottom. `specs-inset` = camera large, product small inset + specs beside/under it. Keep rects within canvas. + `layout-presets.test.ts` (rects in-bounds; showcase matches current dims; presets differ). `npx tsx`.
- [ ] **4.2** `types.ts`: add `layout: LayoutPreset` to `CardRuntime` (default 'product-showcase'); export `LayoutPreset`.
- [ ] **4.3** `compositor.ts`: `CompositeInput` already takes explicit `product/specs/cameraBox` rects — so the recorder computes rects via `regionsFor()` and passes them. For `talking-head`, also draw the product chip small; guard drawShowcaseInfo to the specs rect. Minimal compositor change: it already draws whatever rects it's given; ensure product square letterboxing works at small sizes. (No timestamp/audio impact.)
- [ ] **4.4** `recorder.tsx`: (a) keydown — add `Digit1/2/3` → set active card runtime `layout` + re-render; `KeyR` → retake (see 4.5); `Escape` (recording) → discard (call existing cancel/stop-without-complete); `KeyP` → pause/resume; `Enter` → stop. Keep SPACE=advance, ←/→ prev/next, T=toggle. (b) the RAF loop computes `regionsFor(orientation, runtime[active].layout, dims)` and passes rects to `compositeFrame`. (c) Right-rail UI: a **LAYOUT** switcher (3 preset buttons, active highlighted, keys 1/2/3) + **Retake** control + shortcut keycaps on Pause/Stop, matching Paper `D4F-1`.
- [ ] **4.5** Retake: pure `retakeBounds(bounds: number[], currentIndex: number): { keepBounds: number[]; rewindToSec: number }` in layout-presets.ts (or a retake.ts) + test — drops boundaries from the current scene onward, returns the rewind point (start of current scene). In `recorder.tsx`, `handleRetake` trims `spaceTimesRef` to keep earlier scenes and resets the active card runtime (photoIndex/videoIndex=0). NOTE: because MediaRecorder produces one continuous blob, a true mid-take "re-roll" that discards already-recorded frames isn't possible without re-architecting to per-scene segments — so for THIS pass, Retake resets the CURRENT product's on-screen media to the top and drops its boundary marker so the editor treats the retaken portion as the kept scene (documented limitation; full frame-discard = Phase 3b). Keep the pure boundary math tested.
- [ ] **4.6** `tsc` + `npx tsx` tests. Commit `feat(content-studio): recorder layout presets (1/2/3) + Retake + locked shortcuts`.

## Task 5 — Verify + milestone

- [ ] **5.1** Playwright (dev-staff): (a) open `/admin/video-editor` ready-state — confirm the LAYOUT switcher + Retake + shortcut hints render; switch presets (1/2/3 highlight). (b) Confirm the editor timeline shows scene colours (load a recording if available, else assert the code path via a short fixture). (c) Export path: verify a `content_items` video row is created (drive an export with a small fixture OR insert-check the handler). Screenshot. 0 console errors. Flag camera compositing (real layout render) for Joey's webcam.
- [ ] **5.2** PROJECT_STATE update; commit. Milestone show-and-tell.

## Deferred to Phase 3b (flag to Joey)
- Music **auto-duck** (touches `export-video.ts` audio path — needs real-video A/V verification).
- **Video Templates** (`content_templates` table + gallery + `start_preset`).
- True frame-discard Retake (per-scene MediaRecorder segments).
- Asset-picker **popover** refinement (intro/outro/music dropdowns already work).

## Exit criteria
- Exported videos land in the Library (`content_items`).
- Recorder has a working layout switcher (1/2/3), Retake, and the locked shortcut map; region math + retake math unit-tested; camera render flagged for webcam check.
- Editor timeline is scene-coloured. `export-video.ts` untouched. tsc green, tests pass, atomic commits.
