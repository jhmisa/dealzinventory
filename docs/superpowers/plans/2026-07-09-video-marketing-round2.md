# Video Marketing — Round 2 backlog (Joey, 2026-07-09)

> Raised after F1–F8 shipped (v1.99.0, branch `feat/canned-responses-ai-consolidation`, committed `cddc5e6`, NOT pushed). **F2 camera confirmed working on a real camera by Joey.** These are the next 6 items. Read memory `project_social_video_marketing_automation` + PROJECT_STATE → Now for the shipped state.
>
> **Key files:** recorder `src/components/video-recorder/recorder.tsx`; compositor `src/lib/video-recorder/compositor.ts`; overlay `src/lib/video-recorder/overlay.ts`; dims/layout `src/lib/video-recorder/types.ts` (`ORIENTATION_DIMS`); showcase reference `src/pages/admin/showcase.tsx`; recorded videos `src/pages/admin/recorded-videos.tsx` + `src/services/recorded-videos.ts`; social queue `src/pages/admin/social-media.tsx` + `src/services/social-media-posts.ts`; caption engine `supabase/functions/_shared/social-caption.ts` (+`.test.ts`) + `supabase/functions/process-social-queue/index.ts`; overlay data `src/services/mine.ts` (`getClaimableByCode`).

Suggested order: **R4 (data-loss bug) first**, then R2 + R3 (layout/library polish), then R5 + R6 (caption edit/format), then R1 (biggest — camera background).

---

## R1. Camera virtual background + blur (greenscreen / segmentation)
**Want:** in the recorder, let the presenter (a) replace the camera background with a **virtual background** image (real greenscreen chroma-key OR ML segmentation), and (b) apply a **background blur** effect. Selectable in the ready-state Devices/Format panel.
**Approach (to research):** the camera is composited per-frame in `compositeFrame` via `drawCover(... camera ...)` (`src/lib/video-recorder/compositor.ts`). Two modes:
- **Blur / virtual bg via segmentation:** run a selfie-segmentation model (MediaPipe `@mediapipe/tasks-vision` ImageSegmenter / SelfieSegmentation, or `@tensorflow-models/body-segmentation`) on the camera frame → get a person mask → draw blurred camera (or a chosen bg image) as background, then the masked foreground on top. Runs in the RAF loop; watch perf at 30fps 720p.
- **Greenscreen chroma-key:** if the presenter has a physical greenscreen, a per-pixel chroma-key (canvas pixel shader / WebGL) is cheaper and sharper than ML. Offer both: "Blur", "Virtual background (image)", "Greenscreen (chroma-key)".
**UI:** a Background control in the ready-state settings card — None / Blur / a small gallery of bg images (+ upload). Persist last choice (localStorage like cam/mic).
**Open Qs:** perf budget on Joey's MacBook (FaceTime HD); do we ship an image library or let them upload; WebGL vs 2D canvas. This is the largest item — likely its own phase with a spike first.

## R2. Recorder overlay: give the product image more room, dedicated specs band, smaller price  ⚠️ Joey flagged — CONFIRM understanding
**Symptom (Img #14–16):** the info block (code/rank/price/description) is drawn OVER the lower ~44% of the product square, covering part of the product photo/video. Description truncates ("Apple M1 chi…"). Price ¥105,500 is huge.
**Want (as I understand it — to confirm with Joey):**
1. **Shrink the live-seller camera** (portrait) so there's a **dedicated specs band** between the product square and the camera. The **product photo/video is no longer covered** by the code/price/specs — it shows in full. The camera still fills **whatever vertical space is left** (smaller than today).
2. **Black gradient** over the specs band that **fades top→bottom** (transparent at the product edge → solid black), exactly like the current scrim, so the product image blends into the specs area (continuity — Joey circled this seam in Img #14).
3. **Description font:** make it **not bold and slightly smaller** so **more spec text fits** (less truncation). (Img #15)
4. **Price:** make it **smaller so it lines up on the same row height as "Rank A"**, freeing horizontal room for the specs column. (Img #16)
**Files:** layout heights in `ORIENTATION_DIMS` (`src/lib/video-recorder/types.ts`) — introduce a `specs` band Rect (portrait: product 720 + specs band H + camera `1280-720-H`); `compositeFrame` (`compositor.ts`) draws product in its square untouched, then the specs band with its own top→bottom gradient, then camera in the remaining box; `drawShowcaseInfo` (`overlay.ts`) re-targets to the specs band, lighter/smaller description weight, smaller price aligned to the code+rank row. Landscape (16:9) equivalent: specs band likely under the product on the left column, camera on the right — decide during build.
**Verify:** portrait recording shows the full product image un-obscured, a specs band below it with a top→bottom black gradient, and a (smaller) camera below that; description fits more text; price aligns with Rank A.

## R3. Recorded Videos card: show product + specs + price, make it searchable
**Symptom (Img #17):** the card shows only the P-code (`P000009`) + shooter + date. Hard to tell what the video is for.
**Want:** under the code, show the **product name + spec description + price** (the same rich description as the overlay/showcase), and include it in the **search** ("Search item, shooter, or caption") so a video is easy to find and re-queue.
**Files:** `src/services/recorded-videos.ts` (join `social_media_posts.item_code` → item/product for description+price; add to the searchable text) + `src/pages/admin/recorded-videos.tsx` (render description+price on the card). Reuse `getItemDescription` / `getClaimableByCode` for a consistent description (see `feedback_consistent_descriptions`). For multi-product videos, show the featured/first code's info (and maybe a "+N more" chip).

## R4. BUG: deleting a queued post also deletes the recorded video  ⚠️ data loss — do first
**Symptom:** a recorded video was removed from the Recorded Videos library after Joey deleted its entry from the Social Media **queue**. Un-queuing should NOT delete the underlying video.
**Root cause (confirmed):** Recorded Videos and queued posts are the **same `social_media_posts` row** (Recorded Videos reads `post_type='video'` rows; the recorder creates one draft post per export). The queue "delete" calls `deleteSocialMediaPost` → hard `DELETE` of the row (`src/services/social-media-posts.ts:135`), so the video vanishes from the library too. (Storage blob isn't deleted, but the row/URL is orphaned.)
**Want:** deleting **from the queue** should only **un-queue** (revert status to `draft`, clear schedule) — the video stays in Recorded Videos. **True deletion** (row + storage blob) happens **only** in Recorded Videos' trash.
**Approach:** in `social-media.tsx` queue, change the delete action to an "unqueue" (`updateSocialMediaPost(id,{status:'draft', scheduled_at:null,...})`) instead of `deleteSocialMediaPost`. Keep the real delete in `recorded-videos.tsx` — and there, ALSO remove the storage object (currently `deleteSocialMediaPost` leaves the blob). Confirm the exact queue-delete handler in `social-media.tsx` before changing.

## R5. View + edit Draft/Queued/Scheduled posts (AI caption generate / edit / regenerate)
**Want:** for posts in Draft, Queued, or Scheduled, an **Edit** action opening a viewer/editor where you can: **Generate caption via AI**, **edit** the generated caption, and **Regenerate**. Save the edited caption back to the post.
**Existing hooks:** `generatePostCaption(postId)` already exists (`social-media-posts.ts:160` → `process-social-queue` `mode:'caption_only'`), and `updateSocialMediaPost` can persist an edited caption. So this is mostly UI: a post edit dialog (media preview + caption textarea + Generate/Regenerate buttons) wired to those two functions. Add to `social-media.tsx` (and reachable from Recorded Videos re-queue).
**Verify:** open a draft → Generate → edit text → Save; Regenerate replaces it; edited caption persists and is what publishes.

## R6. AI caption format: consistent, emoji spec list, product link, multi-product aware
**Want:** captions must consistently include per product: **Code, Price, full Specs** in a lined/emoji format, an **engaging intro**, and the **direct product link**. For **multi-product** videos: recognize each product and briefly list **Code – Price, short description, link**. Consistent every generation.
**Files:** `supabase/functions/_shared/social-caption.ts` (+`.test.ts`) is the caption engine (used by `process-social-queue`). Mirror the proven pattern from AI offers (memory `project_ai_emoji_offer_format` / `project_sell_group_rich_description`): **assemble the structured spec/price/link block in code** (deterministic) and let the model write only the engaging intro — don't rely on the model for the structured part. Product link = the `/mine` link (see `getClaimableByCode`) or shop URL (memory `project_shop_url`). Multi-product: derive the codes from the post's associated item codes (recorder passes `firstCode`; may need to persist ALL codes/itemBounds on the post for multi-product — check the recorder→`createSocialMediaPost` payload, currently only `item_code`=firstCode). Target audience = Filipino, English + emojis (memory `user_target_audience`).
**Open Q:** the post currently stores only one `item_code`. For multi-product captions we must persist the full code list at export time (recorder already computes `itemBounds` + has all `codes`). Add a column / json field or a join table.

---

## Notes for next session
- Start by re-reading this doc + `project_social_video_marketing_automation` memory.
- R4 is a data-loss bug → highest priority. R2 needs a quick Joey confirm on the layout (see the CONFIRM note).
- Verification harness: dev-staff Playwright login works for everything except the real camera (R1/R2 camera visuals need Joey's webcam or Chromium `--use-fake-device-for-media-stream`; a `canvas.captureStream` stub reaches the ready state but does NOT validate real-camera paint).
- Not pushed — v1.99.0 (F1–F8) still awaiting Joey's deploy OK alongside this round.
