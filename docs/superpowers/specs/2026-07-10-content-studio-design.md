# Content Studio — Design Spec

> **Status:** Design in Paper (Dealz-Order → page **Reskin · 6 Content Studio**); core locked 2026-07-10, corrections in progress 2026-07-11. Visual source of truth = that Paper page (17 screens + a FULL FLOW board). This doc is the written contract; it decomposes the work into buildable phases. Each phase gets its own implementation plan.
>
> **Corrections applied 2026-07-11** (see §8 recorder + §8 Plan, §12): (a) Product Video Recorder gained a **live layout switcher** (3 composition presets, keys `1`/`2`/`3`), a **Retake** control, and a full **keyboard-shortcut map**; (b) a new **New Shoot (product-select) dialog** was mocked (artboard `Studio · New Shoot (product select)`), reskinning the shipped `ShootFormDialog` + `InventoryPicker` to MONO.

## 1. Goal

Turn the app into an **all-in-one content engine**: plan what to make → create it → schedule it once → and it posts itself to social on a repeating cadence, with a human only stepping in to veto or fix a failure. Today posting is **one-shot + a manual "Process Queue" button** (Phase 0 was deliberately human-in-the-loop, cron disabled). Nothing recurs. This project adds the automation spine plus the content sources that feed it.

## 2. Core principle (the keystone decision)

**The calendar is the source of truth; the publisher is dumb.**

- Rules **materialise** concrete, editable posts onto a calendar up to a **2-week horizon** (they *choose* which piece goes in each slot ahead of time).
- A **daily cron** reads only *"what is due today"* and publishes it to Blotato. It contains no scheduling logic.
- So automation is **autonomous but never invisible**: everything about to post is visible on the calendar and can be dragged, swapped, or vetoed before it fires.

This is the safety model: we go from a manual button to unattended posting on real accounts, but with a fully auditable queue and a kill switch (pause any rule; disable the cron).

## 3. Information architecture

One **Content Studio** admin area with six in-page tabs, running left-to-right in flow order:

**Plan · Create · Library · Calendar · Rules · Posted**

- The old **Social Media** sidebar item is replaced by a single **Content Studio** entry (with an `AUTO` badge).
- **Shoots** (existing board) folds in as the **Plan** tab.
- **Recorded Videos** folds into the **Library**.
- **Video Editor / Recorder** become the **Create** step.

## 4. The full flow (the thing we locked)

```
PLAN            CREATE               EDIT (video only)   LIBRARY        SCHEDULE            AUTO                POSTED
Shoots board -> Record / build /  -> Trim & brand     -> Content pool -> Pin to Calendar  -> Daily cron ->    Live & logged
(assign,        review / carousel    (scenes, intro/     (tagged by      OR Add to a Rule    reads today's due  (Blotato status,
 orientation,   -- products come     outro, music,       category)       (auto-rotates)      -> Blotato         retry on fail)
 item codes)    from the shoot)      logo, export)
                                     carousels & review cards skip straight to Library
```

The **Plan → Record hand-off** is the backbone: each shoot card has a **Record →** button that opens Create with the shoot's products (item codes) and orientation pre-loaded.

## 5. What already exists (reuse, don't rebuild)

Grounded in code recon (2026-07-10):

- **Posting pipeline:** `social_media_posts` table + `supabase/functions/_shared/blotato.ts` (`publishPost`) + `process-social-queue` edge fn + `_shared/social-caption.ts` (R6 caption: model intro + per-product emoji block). Supports photos, video (Facebook Reel), multi-product `item_codes[]`, `schedule_type` (`now`/`next_slot`/`scheduled`), Blotato submission ids, status sync (`sync-social-status`).
- **Recorder** (`src/lib/video-recorder/*`, `src/components/video-recorder/recorder.tsx`): portrait 9:16 + landscape 16:9, **product-square-over-camera** layout with a specs band; SPACE advances between items (`spaceTimesRef` → `itemBounds`), T toggles photos/videos; background effects (blur / virtual-bg / greenscreen via MediaPipe + chroma-key); pause/resume; exports Blob + `itemBounds` + duration + firstCode.
- **Editor** (`src/lib/video-editor/*`, `src/components/video-editor/*`): trim/split/remove/undo/zoom cut-list (`timeline.ts` `keepIntervals`), intro/outro stitch, music bed (looped, mixed under voice), logo burn (4 corners), export via MediaBunny/WebCodecs → H.264+AAC MP4 (`export-video.ts`; A/V-sync fixes v1.105.1–2 — `mapOutputTimestamp`, `audioTrimWindow` must be preserved), uploads to `social-media` bucket, creates a draft `social_media_posts` row.
- **Video Assets** (`video_assets` table + `video-assets` bucket, `src/services/video-assets.ts`): intro/outro/music library, managed in `intro-outro-controls.tsx`.
- **Shoots** (`shoots` table, `src/pages/admin/shoots.tsx`): kanban Planned/Assigned/Shooting/Published; New Shoot dialog (title, assignee from `staff_profiles`, orientation, item codes via `InventoryPicker`, notes); AI planner (`shoot-planner` edge fn).
- **Reviews:** `customer_reviews` table exists but is **unwired** (no UI, no import).

## 6. Data model

### New tables

**`content_categories`** — the pools.
`id, name, color (hex), slug, created_at`. Seed: New Arrivals (#2E5E7D), Deals (#C52F12), Reviews (#256B43), Kaitori Explainers (#8A6200), Quotes (#6D5BA6).

**`content_items`** — the Library unit (a reusable piece of content).
`id, kind ('video'|'carousel'|'review_card'|'quote'|'photo'), title, category_id → content_categories, media_urls text[], thumbnail_url, item_codes text[] (nullable — quotes/reviews aren't product-bound), orientation ('portrait'|'landscape'|'square'), duration_sec (nullable), source ('recorder'|'editor'|'carousel'|'review'|'import'), is_evergreen bool default false, active_from date null, active_to date null, cooldown_days int default 0, times_posted int default 0, last_posted_at timestamptz null, retired_at timestamptz null (excluded from rotation when set), shoot_id → shoots null, created_by, created_at, updated_at`.

**`content_rules`** — the automations.
`id, name, category_id → content_categories (the pool), cadence jsonb ({ type: 'weekly'|'daily', days: int[] (0–6), time_of_day: 'HH:MM', times_per_week int }), pick_strategy ('lru'|'random'|'newest'), platform text default 'facebook', account_id text, page_id text, materialize_horizon_days int default 14, active bool default true, active_from date null, active_to date null, created_by, created_at, updated_at`.

### Changed table

**`social_media_posts`** becomes the **calendar entry / scheduled post** (one row = one thing that will post at one time). Add:
`content_item_id → content_items null, rule_id → content_rules null, origin ('manual'|'rule'), category_id → content_categories null (denorm for calendar colour)`. Keep existing `scheduled_at, status, schedule_type, media_urls, item_codes, caption, blotato_submission_id, blotato_post_url, error_message`. A rule-materialised card has `origin='rule'`, `rule_id` set, `content_item_id` set (the chosen piece), `status='scheduled'`. A pinned card has `origin='manual'`.

### Reused

- **`video_assets`** — extend `kind` CHECK to include `'logo'` (optional). Otherwise unchanged.
- **`customer_reviews`** — becomes the source for review-card `content_items`. Add `imported_from ('manual'|'csv'|'paste'), review_card_content_item_id → content_items null`.
- **`shoots`** — unchanged; `content_items.shoot_id` back-links produced content.

**`content_templates`** (new) — reusable video layouts.
`id, name, orientation ('portrait'|'landscape'), layout ('product'|'talking_head'), start_preset ('talking_head'|'specs_focus'|'product_showcase') null, category_id null, intro_asset_id → video_assets null, outro_asset_id null, music_asset_id null, logo_enabled bool, logo_corner text, scene_structure jsonb (ordered scene stubs, optional), config jsonb (specs-band style, captions on/off, music volume, auto-duck), created_by, created_at`. Starting a recording from a template pre-loads its orientation, layout mode, **starting composition preset** (the recorder's live layout switcher, §8), and finishing (intro/outro/music/logo) so every video is on-brand and consistent. Note: the three composition presets are a **recorder-level, in-take** feature (baked, not scenes — §8); `start_preset` only sets which one is active when recording begins.

## 7. The engine (edge functions + pg_cron)

Two idempotent jobs, reusing the existing Blotato client and caption builder.

**`materialize-rules`** (runs on a schedule, e.g. hourly, and on rule create/edit):
For each active rule, for each due slot (from `cadence`) within `now → horizon_days` that has **no** existing `social_media_posts` row for `(rule_id, scheduled_at)`:
1. Build the eligible pool = `content_items` where `category_id = rule.category_id` AND `is_evergreen` (or explicitly added) AND `retired_at IS NULL` AND within `active_from/active_to` AND not within `cooldown_days` of `last_posted_at`.
2. Pick one by `pick_strategy` (`lru` = min `last_posted_at`; `random`; `newest` = max `created_at`).
3. Insert a `social_media_posts` row (`origin='rule'`, `rule_id`, `content_item_id`, `category_id`, `scheduled_at=slot`, `status='scheduled'`, media/caption resolved from the content_item).
This is what paints the calendar's dashed "ghost" cards. Swapping/vetoing on the calendar edits/deletes these rows; pausing a rule stops future materialisation and deletes not-yet-due rule rows.

**`publish-due`** (pg_cron, daily 08:00 JST — cadence TBD):
Select `social_media_posts where status='scheduled' and scheduled_at <= now()` (or due today) → for each, publish via `publishPost` (Facebook Reel for video, carousel for multi-image), generate caption if blank (`social-caption.ts`), set `status='scheduled'→published/failed`, store `blotato_submission_id`. **Idempotent**: a per-row processing guard prevents double-publish on retry. On publish, bump `content_items.times_posted` + `last_posted_at`.

> **pg_cron ↔ edge-fn constraint** (learned prior): cron functions calling edge fns must hardcode URL + anon key; `app.settings.*` GUCs can't be set by the postgres role.

> **Safety:** ship `publish-due` **disabled**; enable only when Joey approves going live. Provide a global kill switch (a settings flag the cron checks) and keep the manual "Process Queue" path as a fallback.

## 8. Screens (behaviour) — see Paper for visuals

- **Plan (Shoots):** existing kanban in the Studio shell. Each card gains **Record →** (opens Create in record mode with the shoot's `item_codes` + orientation pre-loaded) or **Assign →** when unassigned. Published cards link to the post. Board header has **+ New Shoot** and **★ Plan with AI** (AI variant not yet mocked — see §14).
- **New Shoot dialog (product select):** the MONO reskin of the shipped `ShootFormDialog`, same fields/behaviour 1:1 — **Title** (required), **Assignee** (from `staff_profiles`), **Orientation** (portrait/landscape/none), **Item Codes** (the canonical **`InventoryPicker`**: Category / Brand / ¥Min / ¥Max filters + code-or-description search → results table `thumb · Code · Grade · Description · Price · Add`, one-by-one add; added rows show **✓ Added**), a **selected-codes chip box** with an inline "type a code + Enter" input (Enter/comma adds, Backspace removes last), and **Notes**. Submit writes `shoots.item_codes text[]` (ordered) — **those codes are exactly what the recorder loads** into its product rail / `CodeStrip`, in order. This is the canonical "pick the N products for a shoot" step; do not reinvent a picker. Footer: *"N items · they travel into Record in this order."* → **Create Shoot**.
- **Create hub:** four makers — Record product video, **Record talking-head explainer (NEW layout)**, Build carousel, Make review card — plus recent drafts.
- **Talking-head recorder (NEW layout mode):** a third recorder layout ("image + corner"): full camera → shrink to a **PiP corner** while a chosen image fills the frame; **← Prev / Next → (arrow keys or SPACE)** advance images, each switch saved as an `itemBounds` boundary; PiP corner + size controls; Reel/Flat; visible Pause/Stop. Reuses the compositor/`itemBounds` machinery. Hands off to the editor ("Finish & edit"). **TBD (§14): mirror the product recorder's transport + shortcut map here for consistency** — Retake (`R`) / Pause (`P`) / Stop (`Enter`) / discard (`Esc`); layout presets don't apply (talking-head is its own layout).
- **Video Editor (improvements over current):** portrait preview + **time ruler with seconds + total duration**; **timeline shows each scene as a colour-coded segment** (from `itemBounds`) with trim handles, split/remove/undo, and a visible removed ("CUT") piece; **Finishing** rail with intro/outro/music/logo — each row opens an **Asset picker** popover sourced from the **Video Assets library** (list + upload + manage); **Music auto-duck under voice** toggle; **Preview final**; **Export to Library** (instead of dumping to a separate page). Preserve `export-video.ts` A/V-sync contract.
- **Video Templates:** a gallery (under Create) of reusable **9:16** and **16:9** templates; each shows its layout preview + what it bakes in (intro/outro/music/logo/scene structure). "Use template →" starts a recording pre-configured; "New template" designs one. Both recorders (product + talking-head) can start blank or from a template.
- **Product-video recorder (existing layout, restyled + 2026-07-11 additions):** product-square + specs band on top, live camera below; left product rail (from the shoot's item codes); right controls = Photos/Videos toggle, camera background (none/blur/virtual/greenscreen), ← Prev / Next → product cue, **LAYOUT switcher**, matched **Retake / Pause / Stop**. Same `itemBounds` machinery. → Finish & edit → editor.
  - **Live layout switcher (NEW):** three composition **presets**, switchable *during* recording — `1` **Talking head** (presenter full-frame, product as a lower-third chip), `2` **Specs focus** (presenter large, product image + spec sheet inset), `3` **Product showcase** (product large, presenter corner PiP — today's default). **Layout switches bake into the continuous take — they do NOT create timeline scenes** (unlike product switches). Rationale: a beat may be ~2s; per-scene segmentation would clutter the editor, and the presenter is directing live, so excess is handled by trim/split in the editor. Trade-off named: a layout choice is fixed at record time (trim-only, not re-composited in post). A `content_template` may set the *starting* preset.
  - **Retake (NEW):** `R` re-rolls the **current product's scene** — discards everything recorded since the last scene marker (the current product segment, including its inline layout switches) and re-records from the same product; **all earlier products stay intact.** `Esc` is the heavier **Discard & restart** (throws away the whole take).
  - **Keyboard-shortcut map (locked):** `SPACE` / `→` = next product · `←` = prev product · `1`/`2`/`3` = layout presets · `T` = toggle Photos/Videos · `R` = Retake (current scene) · `P` = Pause · `Enter` = Stop (recording complete) · `Esc` = discard whole take. Stop is `Enter` (means "done/commit"), deliberately **not** `Esc` (which reads as cancel).
- **Carousel builder:** ordered, reorderable slides (first = cover) + caption + category → `content_item` kind `carousel`.
- **Review-card maker:** paste a review (or Import from Facebook — see §9) → reviewer + rating + card style (Forest/Ink/Paper) → renders a 1080×1080 branded quote card `content_item` in the Reviews category.
- **Library:** grid of all `content_items`, filter by type + rotation status; each card shows rotation state (In rotation · N× · next date / Pinned / Evergreen (not in a rule) / Not scheduled / Retired). Per-item controls: evergreen toggle, active window, cooldown, **retire** (sets `retired_at`, excluded from rotation, not deleted).
- **Calendar:** Month + Week. Cards = pinned (solid, category left-bar) vs auto/ghost (dashed). Past = "N posted". Today highlighted. Week view: time lanes, **drag a card to reschedule** (updates `scheduled_at`), live "now" line, click a slot → **Add-content popup** (search Library → pin to that slot as a manual card). Materialisation horizon visible (far-future mostly empty).
- **Rules:** list of automations (toggle on/off, cadence, pool, pick strategy, next runs, lifetime count; paused state). **New Rule builder:** pick pool → how often (3×/week with day toggles + time, or daily/weekdays/custom) → which one to post (LRU/random/newest) → active window → plain-English preview → Create.
- **Posted:** log of sent posts with Blotato status (published/scheduled/failed), source (rule/pinned/manual), retry on failure.

## 9. Reviews ingestion (reality check)

Meta restricts/deprecated page-ratings via API — **no live FB scrape.** Ingestion is **import-based**: manual entry, paste, or CSV import into `customer_reviews`, then the review-card maker renders each into a branded `content_item`. The "Import from Facebook" button is a paste/CSV assist, not a live fetch. Feed the Reviews category → a rule posts them (e.g. 1×/day, LRU).

## 10. Blotato specifics

- **Video** → Facebook Reel (`mediaType: 'reel'`), already handled.
- **Carousel** → multi-image post (`mediaUrls[]`); confirm carousel support/params against Blotato publish-post docs during build.
- **Scheduled** → pass `scheduledTime`; but our model prefers the daily cron publishing "due today" immediately, so most posts go out as `now` at their due time rather than relying on Blotato's own scheduler (single source of truth = our calendar). Decide per-platform during Phase 1.

## 11. Build phases (decomposition — each is its own plan)

The system is too large for one plan. Build in dependency order; ship each phase.

- **Phase 1 — Scheduler backbone + Library + Calendar.** `content_categories`, `content_items` (+ generalise Library over `social_media_posts`/`recorded_videos`), `social_media_posts` calendar-entry changes; Calendar Month/Week + drag + Add-content popup; `publish-due` cron (shipped disabled); Library grid + rotation status fields. *This is the keystone — nothing is "automatic" without it.*
- **Phase 2 — Categories + Rules + rotation.** `content_rules`; `materialize-rules` engine; Rules tab + New Rule builder; Library rotation controls (evergreen/active-window/cooldown/retire); ghost cards on the calendar.
- **Phase 3 — Video flow.** Plan tab (Shoots in shell) + New Shoot dialog reskin (embed existing `InventoryPicker`) + **Record hand-off** (pre-load shoot products in order); **product recorder additions** (live layout switcher w/ 3 baked-in presets + `1`/`2`/`3`; **Retake** re-roll-current-scene + `R`/`Esc`; full shortcut map — see §8/§12); **talking-head recorder layout** (+ optional transport parity, §14 Q6); **editor improvements** (seconds ruler, scene-segmented timeline, asset picker, auto-duck, Preview-final, Export-to-Library). Preserve `export-video.ts` sync tests.
- **Phase 4 — Content sources.** Reviews ingestion (import + `customer_reviews` wiring) + review-card maker; carousel builder.

Recommended order: **1 → 2 → 3 → 4** (3 and 4 can overlap once the backbone exists). Go-live of the cron gated on Joey's approval.

## 12. Design decisions locked

- MONO design system throughout (Paper `#F3F1EC`, Ink `#16140F`, Umber CTA `#4A463E`, Space Grotesk titles / IBM Plex Sans body / JetBrains Mono data, tinted status chips, `#EADFCB` selected border). Record/edit surfaces are dark studios.
- Category = colour, carried across chips, calendar cards, rule dots.
- Auto (dashed) vs Pinned (solid) is the calendar's core visual language.
- Recorder advance = ← / → arrow keys (and SPACE); Stop is a visible red button.
- **Recorder keyboard-shortcut map (2026-07-11):** SPACE/→ next · ← prev · 1/2/3 layout presets · T Photos/Videos · R Retake (current scene) · P Pause · Enter Stop (complete) · Esc discard whole take.
- **Layout presets bake into the take, not scenes (2026-07-11):** product switches = timeline scenes; composition switches (talking-head / specs-focus / product-showcase) are inline within the continuous take, trimmed in the editor if long.
- **Retake = re-roll the current scene (2026-07-11):** `R` redoes the current product's segment keeping earlier products; `Esc` discards the entire take.
- **`InventoryPicker` is the one canonical product-selection UI:** the New Shoot dialog embeds it; do not build parallel pickers. Shoot products live in `shoots.item_codes text[]` (ordered) and flow straight into the recorder in that order.
- Three levels of "stop showing this": pause a rule / retire an item / veto one occurrence; plus active-window + cooldown for graceful expiry.

## 13. Non-goals (YAGNI for now)

- Live Facebook review scraping (import only).
- Multi-account fan-out beyond the current FB page (model allows it; not built now).
- Per-scene re-record, background-quality slider, custom logo XY/opacity (recon "nice-to-haves" — deferred).
- Blotato-side scheduling as source of truth (our calendar is).

## 14. Open questions for Joey / implementation

1. `publish-due` cadence — once daily at a fixed hour, or hourly reading "due this hour"? (Affects how precisely posts hit their scheduled time.)
2. Materialisation horizon — 14 days confirmed? And how far ahead to show empty in the month view.
3. Should the other Studio screens' tab bars get the **Plan** tab swept in now (cosmetic) or during Phase 1 build? (Mockups currently show it only on the Plan screen + flagship.)
4. Carousel publishing params on Blotato — verify during Phase 1.
5. **"Plan with AI"** entry (Plan board) — not yet mocked. Mock the AI variant (describe a theme → AI proposes a shoot + suggested products, backed by the existing `shoot-planner` edge fn) or defer?
6. **Talking-head recorder transport parity** — apply the product recorder's Retake + shortcut map (`R`/`P`/`Enter`/`Esc`) to the talking-head recorder for consistency? (Recommended; layout presets N/A there.)
