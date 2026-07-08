# Video Editor / Recorder — Fixes from Joey (2026-07-09)

> **Context:** raised after A1–A4 shipped (v1.98.0, branch `feat/canned-responses-ai-consolidation`, committed-not-pushed). These are corrections Joey found while using the recorder + editor. Screenshots referenced were in the chat. Read `docs/PROJECT_STATE.md` → Now and memory `project_social_video_marketing_automation` for the shipped state + file map.
>
> **Key files:** recorder `src/components/video-recorder/recorder.tsx`; compositor/overlay `src/lib/video-recorder/{compositor,overlay,types}.ts`; editor `src/components/video-editor/*` + `src/lib/video-editor/{timeline,export-video}.ts`; showcase reference `src/pages/admin/showcase.tsx`; overlay data `src/services/mine.ts` (`getClaimableByCode`).

Priority order: **F2 (camera black) and F1 (playback skip) are functional blockers.** F3 (specs) is high customer value. F4 (controls UI) + F5 (preview proportion) are polish (F5 is largely a side-effect of F2).

---

## F1. Play must skip removed segments and play through continuously
**Symptom (Img 1–2):** after Remove-ing a segment (red hatched region), pressing **Play** stops when the playhead reaches the *start* of the removed region and does not continue; you must click Pause then Play again to resume past the cut.
**Want:** Play previews the FINAL edited video exactly as it will export — automatically skipping every removed region and playing seamlessly to the end.
**Likely root cause:** the editor's preview playback loop does not jump the playhead over removed intervals *during* playback — it either pauses at the cut boundary or only applies the skip on a manual seek.
**Fix approach:** in `src/components/video-editor/video-editor.tsx` (preview playback), drive playback off the kept ranges from `keepIntervals()` (`src/lib/video-editor/timeline.ts`). On each `timeupdate`/rAF tick: if `currentTime` has entered or reached the end of the current kept interval, `video.currentTime = <start of next kept interval>` and keep playing (do NOT pause); when past the last kept interval, stop at the end. Make sure the manual scrubber and the exported cut (`keepIntervals`) and the preview all agree.
**Verify:** load a clip, Remove a middle piece, press Play once → it plays start→cut→jumps→continues→end without a second click. (Playwright with a fixture video is fine here.)

## F2. Camera is black in the recorder — no live preview, and it records black  ⚠️ TOP PRIORITY
**Symptom (Img 3,4,5,8,9):** camera + mic selects are populated (FaceTime HD Camera / MacBook Pro Microphone) but the camera square renders solid black in the ready state, and the recorded video's camera area is black too. No way to test the camera.
**Want:** the selected camera shows LIVE in the camera square during setup (that IS the "test"), and composites into the recording.
**Likely root cause:** the source `<video ref={cameraRef} className="hidden">` uses `display:none`, which does not reliably paint frames to the canvas via `drawImage` for a REAL camera stream. (This slipped through earlier verification because the Playwright stub used `canvas.captureStream()`, which keeps painting even when the element is `display:none`. A real MediaStreamTrack behaves differently.) `.play()` is also never called explicitly.
**Fix approach (in `recorder.tsx`):**
1. Stop using `display:none`. Render the camera `<video>` off-screen but still in the layout/paint tree, e.g. `className="pointer-events-none fixed left-[-9999px] top-0 h-[2px] w-[2px] opacity-0"` (or `1px` sized, `opacity-0`). It must remain a painted element so the browser decodes frames.
2. After setting `cameraRef.current.srcObject`, explicitly `await cameraRef.current.play().catch(() => {})`.
3. Attach `srcObject` as soon as the stream is acquired (and on device change), not only gated on `phase`.
4. Confirm the compositing loop's guard `camera.readyState >= 2 && camera.videoWidth > 0` then passes.
**Verify (IMPORTANT):** a `canvas.captureStream` stub will FALSELY pass — it masks this bug. Verify with EITHER (a) a real webcam (ask Joey), OR (b) Playwright launched with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` so `getUserMedia` returns a real decoder-backed fake camera track (not a canvas capture). The recorded MP4's camera region must show the feed, not black.

## F3. Info block: stop repeating the title, show the real specs (mirror showcase)
**Symptom (Img 6):** the block shows the model name as a title AND a near-identical description line ("Apple iPad (6th generation) Wi-Fi + ..." twice), and the actual specs (storage/RAM/chip/color) are truncated to one line.
**Want:** render it like the customer **showcase page** — code · Rank · price · the full spec-rich DESCRIPTION — so customers don't need to ask for specs.
**Root cause:** `drawShowcaseInfo` (`src/lib/video-recorder/overlay.ts`) draws BOTH `card.title` (brand+model) and `card.subtitle` (the description, which also starts with brand+model), and clamps the subtitle to a single ellipsized line.
**Fix approach:**
- Drop the separate brand+model title line. Render the **description** (`card.subtitle`) as the primary text, wrapped to ~3 lines (showcase uses `line-clamp-3`), plus optional condition notes below (showcase shows a "Condition" label + notes).
- Confirm `card.subtitle` is the SAME description string the showcase page shows. Showcase builds it via `getItemDescription`/`getShowcase*` in `src/services/showcase.ts`; the recorder gets `subtitle` from `getClaimableByCode` in `src/services/mine.ts`. They should match (cross-ref memory `feedback_consistent_descriptions`). If the recorder's subtitle is thinner than showcase's description, align the source so the spec fields (storage, RAM, chip, screen, color) actually appear.
- Compare pixel intent with `src/pages/admin/showcase.tsx` info block: code 36px + Rank badge inline, struck original price, price 72px extrabold, description ~30px `line-clamp-3`, condition label+notes.
**Verify:** a laptop/tablet with specs (e.g. B000285 iPad, or a P-code laptop) shows storage/chip/etc in the recorder info block, and it is NOT a duplicated title.

## F4. Ready-state controls arrangement (UI/UX)
**Symptom (Img 7):** Photos/Video + `T`, then Vertical/Landscape, then Camera dropdown, Mic dropdown, then Start recording — inconsistent alignment (some centered, some left), uneven widths, scattered.
**Want:** a clean, grouped arrangement.
**Fix approach (in `recorder.tsx` render):** group into a tidy panel under the preview. Suggested: a bordered settings card with two labeled rows — **Format** (orientation segmented control + Photos/Video segmented control, aligned) and **Devices** (Camera select + Mic select, full-width, left-icon, equal width) — then a prominent, centered **Start recording** button below. Consistent widths, spacing, alignment. Consider the `frontend-design` or `ui-ux-pro-max` skill. Keep the `T` shortcut hint subtle.
**Verify:** Playwright screenshot in both orientations reads clean and aligned.

## F5. Editor preview proportion
**Symptom (Img 8,9):** the recorded-video preview in the editor looks off / mostly black.
**Note:** much of the "empty black" is a side-effect of F2 (camera recorded black) — re-check AFTER F2 is fixed. Then confirm the editor preview shows the video at its native aspect (9:16 → 720×1280, 16:9 → 1280×720) with `object-contain`, no distortion or wrong forced aspect.
**Fix approach:** inspect `src/components/video-editor/*` preview `<video>`/container; ensure it honors the source dimensions. Fix any hard-coded square/aspect box.
**Verify:** a 9:16 recording previews tall; a 16:9 recording previews wide; neither is stretched.

---

## Verification harness reminder
- F1/F3/F4/F5: Playwright with the dev-staff login (`.env.local` `DEV_STAFF_EMAIL`/`DEV_STAFF_PASSWORD`) is sufficient.
- **F2 MUST NOT be verified with a `canvas.captureStream` getUserMedia stub** — it hides the exact bug. Use a real camera or the Chromium fake-device launch flags.
- After fixes: `npx tsc --noEmit`, `npm run build`, `npx tsx src/lib/video-recorder/overlay.test.ts`, lint changed files, then bump `package.json` (next: v1.99.0) and update PROJECT_STATE + this doc's status. Still not pushed until Joey approves deploy.
