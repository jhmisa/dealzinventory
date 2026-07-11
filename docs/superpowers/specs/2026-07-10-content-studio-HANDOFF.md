# Content Studio — Session Handoff (resume here)

> **Status (2026-07-10):** Design in Paper is ~complete and being locked. Joey has **more corrections to make before we lock** — do those next, then finalize the spec, then build Phase 1 in a fresh session. Design was done in an extended brainstorming session; nothing is coded yet.

## Where everything lives

- **Spec (source of truth for the build):** `docs/superpowers/specs/2026-07-10-content-studio-design.md` (data model, engine, screens, 4 build phases, open questions).
- **Visual mockups:** Paper file **Dealz-Order** `01KTQMN7R5SPG1C5MQ56V97PP9`, page **"Reskin · 6 Content Studio"** (pageId `8-1`). Built in the MONO design system (Paper `#F3F1EC`, Ink `#16140F`, Umber CTA `#4A463E`, Space Grotesk/IBM Plex Sans/JetBrains Mono, tinted status chips). Record/edit surfaces are dark studios.
- Paper MCP needs the **desktop app open on the file** to edit. Call `get_guide({topic:"paper-mcp-instructions"})` once per session before editing.

## Artboards (id → name) for quick targeting

- `CLT-1` — Content Studio · FULL FLOW (lock this) — the pipeline diagram
- `CQM-1` — Studio · Plan (Shoots) — Shoots kanban in the 6-tab shell
- `BLQ-1` — Studio · Create (4 makers)
- `B8X-1` — Studio · Library (rotation status + filters)
- `A2K-1` — Studio · Calendar — Month
- `ABQ-1` — Studio · Calendar — Week (drag)
- `AMV-1` — Studio · Rules
- `AZT-1` — Studio · Rules — New rule (builder modal)
- `BZY-1` — Studio · Posted
- `CBL-1` — Studio · Add content popup
- `BWI-1` — Studio · Talking-head Recorder
- `D4F-1` — Studio · Product Video Recorder (updated 2026-07-11: live layout switcher + Retake + shortcut map)
- `DEX-1` — Studio · New Shoot (product select) — NEW 2026-07-11 (MONO reskin of ShootFormDialog + InventoryPicker)
- `CE1-1` — Studio · Video Editor
- `CPJ-1` — Studio · Asset picker (from editor)
- `CHQ-1` — Studio · Review-card maker
- `CJM-1` — Studio · Carousel builder
- `D7H-1` — Studio · Video Templates

## Locked decisions

- **IA:** one Content Studio, 6 tabs left-to-right = **Plan · Create · Library · Calendar · Rules · Posted**. Shoots folds in as **Plan**; old Social Media sidebar item → single "Content Studio" entry; Recorded Videos → Library.
- **Keystone:** calendar-as-source-of-truth. Rules **materialise** editable posts ~2 weeks ahead; a **dumb daily cron** publishes only "due today" to Blotato (ships **disabled** until go-live; kill switch).
- **Full flow:** Plan(Shoots) →record→ Create →video→ Edit →save→ Library →pin/rule→ Schedule →cron→ Auto → Posted. Plan→Record hand-off pre-loads the shoot's products + orientation.
- **Content model:** generalize to `content_items` (video/carousel/review_card/quote/photo); `social_media_posts` becomes the calendar-entry/scheduled-post; new `content_categories`, `content_rules`, `content_templates`. Reuse `video_assets`, `customer_reviews`, `shoots`, `blotato.ts`, `social-caption.ts`, `export-video.ts` (preserve its A/V-sync tests).
- **Reviews:** import/paste/CSV only (Meta blocks live FB scraping).
- **Recorder:** two layouts — product-square-over-camera (existing) + talking-head "image + corner" (new); ← Prev / Next → (arrows + SPACE); visible matched Pause/Stop; clickable scene filmstrip.
- **Templates:** reusable 9:16 / 16:9 layouts baking in intro/outro/music/logo/scene structure.

## Build phases (each its own plan, do in order)

1. **Scheduler backbone + Library + Calendar** (keystone; publish-due cron shipped disabled)
2. **Categories + Rules + rotation engine** (materialise-rules; New Rule builder)
3. **Video flow** (Plan tab + Record hand-off; talking-head layout; editor improvements: seconds ruler ✓ in mock, scene-segmented timeline, asset picker, auto-duck, Export-to-Library; Templates)
4. **Content sources** (reviews ingestion + review-card maker; carousel builder)

## Done 2026-07-11 (applied to Paper + spec)

- **Product Video Recorder (`D4F-1`):** added live **LAYOUT switcher** (3 presets Talking/Specs/Showcase, keys `1`/`2`/`3`, baked-into-take not scenes), **Retake** (`R`, re-rolls current scene; `Esc` discards whole take), and full **shortcut map** (SPACE/→ next · ← prev · `T` Photos/Videos · `P` Pause · `Enter` Stop). Spec §8/§12 updated.
- **New Shoot dialog (`DEX-1`):** MONO reskin of the shipped `ShootFormDialog` + `InventoryPicker` (title/assignee/orientation/item-codes/notes; search-filter-add-one-by-one results table; selected chip box; `shoots.item_codes[]` → recorder in order). Spec §8 Plan updated.
- Paper `write_html` gotcha: it **ignores Tailwind utility classes** — use **inline `style="…"` CSS**. Column frames default to `align-items:flex-start` (hug), so children don't fill width; set `width:100%` + `align-items:stretch` on the container chain, or the flex-1 column collapses.

## OPEN — Joey's pending corrections (do these before locking)

- Joey may have more design corrections. **Ask him for the next item and apply it in Paper**, then update the spec (do it per-correction now — we're keeping spec in sync as we go).
- Not yet mocked: **"Plan with AI"** entry on the Plan board (spec §14 Q5). **Talking-head recorder transport parity** with the product recorder (spec §14 Q6).
- Also unresolved (spec §14): publish-due cadence (recommend hourly "due this hour"); materialise horizon (14d); sweep the **Plan** tab into the other screens' tab bars (currently only on Plan + partially); Blotato carousel params to verify.

## NOT yet committed

- The spec + this handoff are written to disk but **not committed** — current branch is `feat/canned-responses-ai-consolidation` (unrelated). Start this work on its own branch when building.
