# Research Note — Social & Video Marketing Automation

**Date:** 2026-07-03
**Status:** Exploration / "maybe later" — NOT scheduled, NOT a priority. Captured so the reasoning isn't lost.
**Context:** Joey brain-dumped several marketing ideas. This note records the analysis, the landscape research, and a phased path — so we can pick it up cold later.

---

## ▶ TO RESUME THIS PLAN (read first)

This is a **fully brainstormed, not-yet-built** system. To pick it back up, say something like:
> *"Let's work on the social & video marketing automation plan — read `docs/investigations/2026-07-03-social-video-marketing-automation.md`."*

Then the recommended next step is **writing an implementation plan for Phase 0** (the free bottleneck-killer: server-side caption gen + conversational shoot planner + Blotato push), since that's the highest-value, lowest-risk slice. The recorder is the big new build — plan it as its own phase later.

- **Interactive trim mockup (final, Dealz-themed):** `docs/investigations/recorder-trim-mockup.html` — open in a browser to re-feel the razor+zoom edit UX. This is the LOCKED interaction model.
- **Status of pieces:** everything below is designed + pressure-tested in conversation; nothing is coded. `PROJECT_STATE.md` intentionally untouched (not active work yet).

---

## The problem being solved

Marketing content (Facebook posts + live-selling videos) currently bottlenecks on Joey:

1. **Social posts** — a team member stages a post, then asks Joey to run the Claude **CLI** to write the caption + queue it in Blotato. Joey is the bottleneck.
2. **Live-selling videos** — remote presenters (NZ / Philippines) narrate over **real product media shot in Japan**, composited in **Streamyard** (presenter cam + product overlay from the `/mine` link), edited (cut retakes, add intro/outro), downloaded, and pushed to Facebook. Clunky, external, slow.

Key operational fact that shapes everything: **the presenter is already remote and never holds the product.** Authenticity comes from the *real Japan photos/videos*, not from who is talking. (This dissolves the "AI avatar can't hold the item" concern — see below.)

---

## Three ideas + verdict

| Idea | Verdict |
|------|---------|
| **1. Team posts to social without Joey/CLI** | ✅ **The real win.** Root cause: caption generation lives in the CLI, not the server. Move it to an edge function → team uses the existing Social Media page → Joey out of the loop. Guardrail fear ("delete all records") evaporates because the fix is *don't give the team the CLI at all* — the RLS-gated web app has no button that can nuke the DB. |
| **2. In-app video editor (replace Streamyard)** | ⚠️ Feasible now, but **don't build a general video editor.** Build a narrow, template-driven assembler. See "Video" section. |
| **3. AI suggests what to push from inventory** | ✅ **High leverage, ~free.** "Pick 5 affordable laptops → slideshow / individual posts." Same underlying build as #1 (server-side AI that reads inventory → produces a queued post). |

---

## Cost analysis — text AI is effectively free

Runtime cost is per-token, and captions/scripts are tiny. At ~100 posts/month (board shows ~55 published):

- **One caption** ≈ ~1,500 tokens in + ~250 out.
  - Cheap/mini model: **~$0.0005 each** → cents/month total.
  - Premium model: **~$0.006 each** → still well under a cent.
- **"What to push" curation** (~5K tokens/run): even 10 runs/day on a premium model ≈ **~$5/month**.

**Conclusion:** the cost of this feature is *building* it (dev time), not *running* it. A cheap model handles Taglish + emoji captions fine given a few example posts in the prompt (we have 55 published posts to learn the voice from). Suggested split: cheap model for mechanical captions, optionally a smarter model for "what to push" curation (taste matters more, volume is low). Reuses existing OpenRouter config (`ai_providers`) — **no new billing to set up.**

**Video AI is a different tier** — generative video is priced per-second/clip (dollars per video, not cents). BUT Joey has a **Higgsfield subscription** with monthly credits, treated as a learning investment — so video-generation cost is effectively sunk/covered.

---

## The video reframe — why this is tractable

Don't build a video editor. The hard part of an editor is the *general-purpose timeline* (arbitrary clips, scrubbing to cut retakes). The content here is **not** arbitrary — it's a rigid repeating template:

```
[ presenter clip ]  +  [ real Japan product media ]  +  [ overlay card ]  →  assemble  →  Blotato → schedule
```

Two complexity-killers:

1. **The overlay is data**, not design — already rendered in `/mine` from DB (P-code, price, specs, photos). Generate it, don't design it per video.
2. **The presenter is an interchangeable slot** — a video file, regardless of source:
   - **AI "soul"** (Higgsfield export) — variety, always available, scales.
   - **Live presenter** (NZ/PH team) — recorded however they do it now.
   Everything downstream (script, product media, overlay, scheduling) is **identical.** "Both" doesn't double the build; it's one pipeline with a pluggable first ingredient.

**Big consequence:** if the presenter is AI-generated and product media already exists, there's **no live recording at all** — no `getUserMedia`, no MediaRecorder, no timeline, no retake-sync problems. It becomes a *stitch-together* job. That deletes the hardest part of idea #2.

Division of labor that fits Joey's "learning" goal: **keep the creative AI generation in Higgsfield's hands; the system does the boring glue** (script, overlay asset, scheduling, suggestions).

---

## GitHub / landscape research (2026)

The browser video stack crossed a usability threshold recently:

- **WebCodecs + MediaBunny** (MIT, free) — hardware-accelerated, **~8× faster than ffmpeg.wasm** (~200fps vs ~25fps for 1080p H.264, ~500MB RAM). Client-side MP4 export is now viable for short videos. Chromium-only in practice. — [mediabunny.dev](https://mediabunny.dev/), [ffmpeg.wasm alternatives](https://dayverse.id/en/articles/best-ffmpeg-wasm-alternatives-client-side/)
- **Recording (cam + screen)** — solved natively: `getUserMedia` + Canvas compositing + `MediaRecorder`. Libs: [react-record-webcam](https://github.com/samuelweckstrom/react-record-webcam), `use-media-recorder`. Full OSS reference: [Cap.so](https://cap.so/) (Loom alternative, Tauri desktop).
- **Remotion** — gold standard for *data-driven* video (React → MP4). Great for auto-generating overlay segments. **Catch: paid Company License for for-profit companies with 4+ employees** (~$100/mo min "Automators" plan + you run render infra). — [remotion.pro/license](https://www.remotion.pro/license)
- **Turnkey CapCut clones** — [designcombo/react-video-editor](https://github.com/designcombo/react-video-editor) (WebCodecs + PixiJS, client-side export). **Same trap: proprietary license, paid for >3 employees**, and it's a heavyweight *general* editor — opposite of "streamline for the team." Pass.
- **Blotato push — confirmed & easy:** API takes a *public video URL* in `mediaUrls` (no upload step — Supabase buckets are already public, hand it the URL). Supports `scheduledTime` / `useNextFreeSlot`. Quirk: **Facebook video must post as a Reel.** — [Blotato publish docs](https://help.blotato.com/api/api-reference/publish-post)

**Existing asset:** `docs/superpowers/plans/2026-06-15-fal-openrouter-ai-integration.md` already designs the fal.ai server-side async-queue pattern (submit → poll → store). A future Seedance/generative-video call reuses that same plumbing.

### Video build options (if/when we do it)

- **A — Guided assembler (custom, lean).** Overlay from DB + presenter clip (AI or human) + intro/outro → export client-side (WebCodecs/MediaBunny) → Blotato. **License cost $0.** Weeks, not months, because there's no timeline. Risk: audio/video sync across concatenated clips, codec quirks, Chromium-only.
- **B — Remotion render service.** Same inputs, composed server-side. Prettier/deterministic, offloads the render, easy to restyle. Costs ~$100/mo + render infra.
- **C — Fork the CapCut clone.** Fastest to *something*, but proprietary license + heavyweight general editor + maintenance you don't own. Rejected.

---

## Recommended phased path

- **Phase 0 — free, do-anytime (the real bottleneck-killer):** server-side caption/script generation + "what to push" suggestions + Blotato push. Team schedules without Joey or the CLI. Works for human *and* AI videos.
- **Phase 1 — learning:** live presenters *or* hand-made Higgsfield soul clips. System provides the AI script + a downloadable branded overlay asset + one-click schedule. Minimal build.
- **Phase 2 — if it clicks:** automate the assembly (overlay + media + presenter → rendered MP4). Consider Higgsfield API if mature. Hold until "good" is understood by doing Phase 1 by hand.

**Discipline that is the whole ballgame:** hold the scope to the repeating template + interchangeable presenter slot. The moment it drifts toward "general editor," bail.

---

## Update — 2026-07-08 — deeper exploration

### Timeline editors now exist off-the-shelf (verified, MIT, same stack)

The "build a video editor from scratch" risk is **gone**. Mature MIT-licensed, browser-based, WebCodecs timeline editors now exist — two in Dealz's own stack:

- **[FreeCut](https://github.com/walterlow/freecut)** — ⭐ **best fit.** MIT. **React 19 + Vite + Zustand + Tailwind + Radix UI** (≈ our exact stack). Multi-track timeline, trim/split/join/ripple, WebCodecs export to MP4. ~1.5k stars, very active. Forkable as a base.
- **[OpenReel Video](https://github.com/Augani/openreel-video)** — MIT. React 18 + TS + Zustand + **MediaBunny**. Frame-accurate trim/split, WebCodecs. ~3.8k stars, beta (v0.5.0, May 2026). Full suite, not embeddable but forkable.
- **[Omniclip](https://github.com/omni-media/omniclip)** — MIT, but web components (not React) → grafting is harder.

**Takeaway:** an in-house full timeline editor is viable if we ever want it. But (see next) our recording model probably doesn't need one.

### The single-take "SPACE-to-advance" recorder — the key insight

Workflow: **preselect codes → hit record → talk → press SPACE to advance the overlay to the next item → repeat → stop.** One continuous take.

Why this is the unlock:
- Produces **one clip where every segment boundary is already known** (timestamp captured at each SPACE press). The recorder self-labels segments.
- "Editing" collapses to: **trim ends**, **drop a bad item** (clean cut at a known boundary), or **re-record** — no arbitrary timeline arranging.
- It's ONE take, so **there is no cross-clip audio/video sync problem** (the biggest technical risk in the "record N clips and concatenate" model). This single-take design eliminates it.

Build shape: the **recorder is the bespoke part** (preselect codes, live DB overlay, SPACE-advance, canvas capture) — nobody's editor does this; it's the special sauce and it's contained. Editing = lean labeled-segment trim first, with FreeCut as a fork option for power users later. Push = existing Blotato pipeline.

### Recorder scenes — one primitive serves products AND info/guide videos

The recorder is a canvas compositor (background layer + camera, recorded as the canvas). Adding **uploaded images** as an alternate background layer generalizes it at ~zero cost — same primitive, different background:

- **Product mode:** background = DB overlay card + camera
- **Info mode:** background = uploaded collage/slide + camera

Three fixed **scene presets**, switched with a key (like SPACE): `[1] camera full`, `[2] image full`, `[3] image + camera PiP (corner)`. Still one take, one canvas, same trim/drop/re-record editing.

**Bonus:** this IS the tool for the evergreen **guides** ("how to order", "sell in Kaitori", "warranty") — a talking-head-plus-slides recorder = an info-video recorder. One mechanism, two jobs; a scope *reduction* vs a separate info-video tool.

**Hard line (the overcomplication guard):** the recorder DISPLAYS pre-made images, it never EDITS them. ✅ In: fixed scene presets, upload pre-made images per shoot. 🛑 Out: in-app collage/crop editing, freeform drag-resize layouts, multiple images at once, transitions, green-screen. Collages are made in Canva/Higgsfield and re-uploaded. That one rule keeps it weeks-not-months.

### Recorder review/trim model — LOCKED (2026-07-08, validated via interactive mockup)

Editing is deliberately **one track + a list of cut ranges** — full freedom to cut anywhere, none of the NLE complexity. Validated with a working prototype (`.superpowers/brainstorm/.../review-trim-v2.html`).

- **Razor / split (primary interaction):** scrub playhead → **Split** (`S`) → scrub → **Split** → click the piece between → **Remove** (`⌫`). A split just adds a boundary; removing a piece adds its range to the cut list. CapCut-familiar.
- **Zoom:** pure display scaling (px/sec), ruler ticks densify 10s→1s. Enables frame-accurate placement (WebCodecs decodes frame-by-frame). Zero processing cost.
- **Item boundaries** from SPACE taps are pre-existing splits → removing a whole item needs no slicing.
- **Trim ends** (amber handles) for dead air. **Undo.** Click a red piece to restore.
- **Export:** WebCodecs skips removed ranges, frame-accurate.

**Finishing touches (global, on the export screen):**
- **Logo overlay** — on/off + corner. Just drawn on the same canvas (the live-selling dealz mark). Trivial.
- **Background music** — one bed: pick track + volume + optional fade. Mixed with recorded voice via Web Audio, muxed on export. ⚠️ **Must be royalty-free/licensed** — Facebook mutes/blocks copyrighted audio. Load a royalty-free pool from day one.

**The line (what stays OUT to avoid becoming a real NLE):** multi-track, rearranging/reordering pieces, transitions between cuts, layering multiple videos, keyframe animation, per-segment music, in-app image/collage editing. Cutting + trimming + one logo + one music bed = in. Everything else = out.

### Planning board (the front door) — team self-organizes

A lightweight **"Shoots" kanban** (reuse the existing `kanban-board.tsx` component) so the team decides + assigns at their meeting, instead of Joey coordinating:

- Lanes: **Planned → Assigned → Shooting → Published**
- Card = shoot assignment: **title** ("5 Gaming Laptops under ¥80,000"), **assignee** (dropdown; self-assign or assign a teammate), **item codes** (optional at planning, or filled by the recorder), optional orientation/template, status.
- AI **proposes** ideas onto the Planned lane; humans **dispose** (pick up + assign).
- **Keep lean (YAGNI):** no comment threads, due-date reminders, notifications, sub-tasks, approval chains. It's a shoot board, not Asana.
- **Dependency:** no staff roster table exists yet (only scattered `staff_name` text + a `display_name`). Need a tiny `staff_members` table (name + active) for the assignee dropdown.

### Evergreen content library — set-and-forget rotation

Split content into **perishable** (product listings — decided per-cycle) vs **evergreen** (customer reviews, how-to guides, warranty policy, brand story — timeless, auto-rotated).

- **Library table:** `type` (review/guide/policy/promo), title, caption, `media_urls[]`, `is_active`, `last_posted_at`, `times_posted`, `cooldown_days`. Media in a marketing bucket; Blotato takes public URLs.
- **Rotation cron:** for each schedule slot fresh content didn't fill → pick eligible (active AND past cooldown) least-recently-posted → inject to Blotato → stamp. Feed never goes quiet; cooldown prevents over-repeating.
- **Sources:** guides shot *once* with the recorder → library → circulate forever. Reviews uploaded as they arrive.
- **Not a black box:** auto-injected posts appear on the planning board (Scheduled lane) with one-click veto.
- **Decision to make:** backfill-only vs guaranteed cadence. Recommend **backfill-only + a light review minimum** to start.
- **Op note:** confirm permission to re-post customer content before pooling it.

### "What to push" is better as a *conversational* shoot planner

Refinement of thread 3: instead of (only) a weekly cron dropping suggestions, make planning **conversational + on-demand**. The marketer talks to the AI, which queries real stock and proposes a shoot the human edits, then commits to a card.

- **Cheap because the hard part exists:** reuses the messaging AI's proven `search_inventory` tool + OpenRouter config + tool-calling loop. New pieces are small: a chat surface, one `create_shoot` action, the shoots table/board.
- **Flow:** user asks ("find gaming laptops, showcase 3") → AI calls `search_inventory` → returns an **engaging title + real codes as editable chips** (x-out to remove, search to add) + editable title → "Create shoot" → lands on the Planned lane, codes preloaded, ready to assign.
- **Cron dropped (2026-07-08 decision):** the conversational planner absorbs the cron's job — you just *ask* "find 5 laptops aged 60+ days" on demand. No scheduler/notification machinery. Trade-off: pull (someone must ask) vs push (system reminds). Mitigation is NOT a cron — a few **one-tap preset asks** in the planner (`🕗 Aged 60+ days`, `💰 Best deals`, `✨ Just inspected`, `💻 Budget laptops <¥40k`) make the valuable queries discoverable. Only add a real proactive nudge later *if* aging stock is observed slipping through.
- **Keep lean:** a *shoot planner* with two tools (`search_inventory`, `create_shoot`) — NOT a general chatbot. Title generation = the same cheap text engine as captions.

### The full pipeline (all threads unified)

```
1. PLAN       team meeting → shoot cards on the board, assign owners      (front door)
2. SUGGEST    "what to push" AI drops shoot ideas onto Planned            (optional)
3. RECORD     assignee opens card → codes preloaded → SPACE-advance one-take
4. EDIT       trim ends / drop a bad item / re-record
5. PUSH       → Blotato → scheduled
   +  EVERGREEN library auto-backfills empty schedule slots (reviews/guides/policy)
```

Threads 1 (captions/no-CLI), 3 (what-to-push), the recorder, the planning board, and the evergreen pool are **one system** feeding a single Blotato pipeline.

## Open questions / next steps (when revisited)

- Sketch the **"what to push" weekly suggestions** against real inventory (what it recommends, how it picks, what the output post looks like).
- Detail the **caption-gen-without-CLI** flow end to end (edge function, reuse `ai_providers`, wire to the existing "New Post" button + Blotato).
- Nail the **AI-script → Higgsfield → overlay-asset handoff** (what format the overlay asset ships as; how the presenter clip comes back in).
- Research **Higgsfield API** maturity for Phase 2 automation.
- Confirm **Facebook Reel** constraints for vertical live-selling videos via Blotato.
- Define the tiny **`staff_members`** table (name + active) for the assignee dropdown.
- Evaluate **FreeCut** as a fork base (or confirm the lean labeled-segment trim is enough).
- Design the **evergreen library + rotation cron** (cooldown, backfill vs cadence).
- Spec the **SPACE-advance recorder** (canvas compositing, segment-timestamp capture, overlay swap during MediaRecorder capture).
