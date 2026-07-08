# Video Marketing — Backlog / Not-Yet-Accomplished (to reiterate)

> **Purpose:** the running list of improvements + deferred work for the video-marketing pipeline (recorder + editor + posting), so we can pick any of it up cold in a fresh context. Phase 0 (captions/push, Shoots board, AI planner), Phase 1a (Review & Trim editor), and Phase 1b (SPACE-advance recorder) are **shipped** (v1.95–v1.97). This doc is everything *after* that.
>
> **Read-first pointers for a fresh session:**
> - Shipped state + file map: `docs/PROJECT_STATE.md` (Now section) + memory `project_social_video_marketing_automation`.
> - Original design + landscape research: `docs/investigations/2026-07-03-social-video-marketing-automation.md`.
> - Shipped plans: `docs/superpowers/plans/2026-07-08-video-editor-phase1.md`, `…-video-recorder-phase1b.md`.
> - Key seams: `getClaimableByCode` (`src/services/mine.ts`) = overlay data; `VideoEditor` accepts `itemBounds` + `durationHint`; `exportEditedVideo` (`src/lib/video-editor/export-video.ts`) = WebCodecs/MediaBunny export; `Recorder` (`src/components/video-recorder/recorder.tsx`).

---

## A. Requested improvements (Joey) — 2026-07-09

### A1. Default vertical layout = showcase-square (top) + agent-camera-square (bottom)  ⭐ replaces the current default composite
**What:** The default vertical-shot overlay should **reuse the existing product-showcase implementation** (`src/pages/admin/showcase.tsx`) for the **top square**, and put the **agent's camera in a matching square below it**.
- **Top square = showcase media**, exactly like the showcase page: `mediaMode: 'photos' | 'videos'`, all of the product's photos/videos available, **photos auto-rotate** (per `showcase.tsx`'s `setInterval`/`currentIndex` cadence — ~a few seconds each), **videos play** (looped when single). The media viewer there is already **720×720 square** — copy it.
- **Bottom square = the live seller's camera** (agent shooting the video), same square footprint (NOT the small corner PiP the recorder currently uses).
- **Info block** over the media like Image #1: code · rank/grade · **price** · title.
- **In-shoot toggle: photo ⟷ video** for the current item, via keyboard shortcut (proposed: `V`/`P` or a single `T`; `Space` stays = **next item**; auto-rotation handles multiple photos like showcase, so no manual cycling needed). Showcase **video plays muted** while recording (only mic audio captured).
**Why:** matches how the product is actually showcased to customers (real photos/videos rotating) with the seller presenting below — the authentic live-selling format. **This is the DEFAULT** for vertical; other layouts (see B: scene presets) come later for variety.
**Implementation notes:** reuse `showcase.tsx` media logic + `getClaimableByCode`/showcase data (`currentItem.photos` / `.videos`); compositor draws top square (img or hidden `<video>` frame) + bottom square (camera `<video>`); canvas likely two stacked 720×720 squares (→ 720×1440) — finalize dims in planning. **Supersedes** the current hero-full-bleed + corner-PiP default and parts of C (overlay card / PiP-corner).

### A2. In-shoot camera & microphone picker (Zoom/Streamyard-style)
**What:** Let the presenter **select which camera and which microphone** to use, and **show which are currently selected** on screen during the shoot.
**Why:** the machine's default cam/mic often isn't the good external gear set up for the shoot; quick switching + visible confirmation prevents recording with the wrong device.
**Implementation notes:** `navigator.mediaDevices.enumerateDevices()` → dropdowns for `videoinput` + `audioinput` → re-acquire `getUserMedia({ deviceId })` on change → display selected device labels; persist the choice (localStorage) for next time. Model the UX on Zoom/Streamyard device pickers.

### A3. One canonical, reusable product-selector component (adopt everywhere)
**What:** The recorder's item selection must use the **existing "Search Inventory" picker** (Image #3 = `src/components/messaging/inventory-search-modal.tsx` — Category/Brand/¥Min/¥Max + search + rows Code/Grade/Description/Price/+Add), **not** the plain text code box currently in the recorder. Broader rule: **standardize on ONE reusable product-selector component** so any future product-selection feature **calls that component** instead of reinventing it — update it once, updates everywhere.
**Why:** avoid divergent dropdown/selector implementations across areas.
**Implementation notes:** audit current selectors (`messaging/inventory-search-modal.tsx`, `social-media/item-search-input.tsx`, any in orders/create-order) → extract/standardize into one shared component (props for multi-select, filters, code prefixes) → adopt in the recorder, then retrofit the others.

### A4. Searchable "recorded videos" library (find by who shot it, sortable)
**What:** A dedicated area to **browse recorded/shot videos** as **searchable cards**, each showing **who shot it** + key info (item(s), date, length, status). Must be **searchable/groupable by shooter** and **sortable** (by shooter, date, item, etc.) so users find a video fast. Per-card actions: **re-add to the schedule (re-post)** and **delete**.
**Why:** finished recordings shouldn't be fire-and-forget drafts — provide a real place to review, re-schedule, or remove them; searching by shooter is the primary way people will locate their own work.
**Implementation notes:** needs a **shooter identity per recording** (currently only `created_by` auth user → map to `staff_profiles` display name). Likely a filter bar (shooter dropdown, date range, item/text search) + sort + card grid over the recorded videos (draft/scheduled/published social video posts, or a dedicated recordings table). Re-schedule reuses the Social/Blotato path; delete removes row + storage object.

---

## B. Already-deferred (from the shipped plans)

- [ ] **Scene presets** — generalize the recorder beyond product mode: `[1]` camera-full, `[2]` image-full, `[3]` image/slide + camera PiP. Switched by number keys (like SPACE). This ALSO delivers evergreen **how-to / guide videos** (talking-head + slides) — one mechanism, two jobs. Hard line: the recorder *displays* pre-made images, it never *edits* them (no in-app collage/crop). Reuse the existing compositor; add a `scene` to the frame loop + an image-upload slot per shoot.
- [ ] **Music bed** — one royalty-free track: pick + volume + optional fade, mixed with the recorded voice via Web Audio, muxed on export. ⚠️ **Needs Joey to choose/approve a royalty-free source** (FB mutes/blocks copyrighted audio). Editor's export screen gets a track picker; `exportEditedVideo` mixes an `AudioBufferSource` bed under the voice track.
- [ ] **Evergreen content library + rotation** — table (`type` review/guide/policy/promo, caption, `media_urls[]`, `is_active`, `last_posted_at`, `times_posted`, `cooldown_days`) + a backfill rule that fills empty schedule slots with least-recently-posted eligible content. Guides shot once with the recorder → library → circulate. Recommend backfill-only + a light review minimum to start; auto-injected posts still show on the board with one-click veto.

---

## C. Observed during the Phase 1 build (candidate improvements)

> _Small/medium polish noticed while building & verifying. Not committed to — triage with Joey's list._
> _Note: **A1 supersedes** the "richer overlay card", "PiP corner/size" and "two-same-model demo" items below — the new default is the showcase-square + camera-square layout._

- [ ] **Two-different-products demo clarity** — when consecutive codes are the *same model* (e.g. two iPads), the overlay card looks identical across the SPACE boundary, so the "advance" isn't visually obvious. (Cosmetic; the boundary IS captured.) Consider a brief transition/flash on advance, or an "item k/N" that's more prominent in-render.
- [ ] **Richer overlay card** — currently shows title / code / price / (strike) original / grade. Could add key specs (storage · RAM · CPU · color) from `get_item_full_specs` for laptops/phones. Keep it legible on portrait.
- [ ] **Real logo image** — the burned-in logo is a canvas "Dealz" wordmark (zero-asset). Swap to the actual Dealz mark PNG when provided (`LogoConfig.image` path already supported in `logo.ts`).
- [ ] **Recorder UX** — no retake/pause mid-take (only Stop → re-enter); `getUserMedia` has no timeout (indefinite "Preparing…" if the permission prompt is ignored); PiP corner/size is fixed (`tr`, 0.3). Consider a settings row.
- [ ] **Orientation** — portrait-only (720×1280). A landscape option would need a canvas-size toggle in the recorder + the editor's export honoring source dims (editor already preserves source aspect).
- [ ] **Shoot lifecycle tie-in** — after a video is exported from a shoot, optionally auto-advance that Shoot card to SHOOTING/PUBLISHED, or link the draft post back to the shoot.
- [ ] **Manual code entry ergonomics** — the record-without-shoot path takes a space/comma code string; no live validation/search-to-add chips (the messaging `search_inventory` UX exists and could be reused).

---

## D. Notes / constraints to remember

- **Draft-only safety:** the editor NEVER publishes; it creates `status:'draft'` posts. Publishing stays behind the human "Process Queue" button (Blotato). Keep it that way.
- **Chromium-only export:** WebCodecs (`VideoEncoder`) — feature-detected (`canExportVideo()`); Safari/Firefox see a "Use Chrome/Edge" notice.
- **MediaRecorder webm:** `<video>.duration = Infinity` until seeked → the recorder passes `durationHint` (its measured length) to the editor. MediaBunny still decodes/exports it fine.
- **Upload path:** exported MP4 is uploaded **directly** to the public `social-media` bucket — NOT via `uploadMedia`/`tryProcessVideo` (which strips audio `-an` and square-crops).
