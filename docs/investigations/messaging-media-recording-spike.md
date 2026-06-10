# Phase 0 Spike — Recorded audio/video delivery to Messenger via Missive

**Date:** 2026-06-10
**Goal:** Before building the in-composer audio/video recorder, empirically confirm (1) does Missive forward recorded media to Facebook Messenger as a *playable* message, (2) what container/codec the customer's phone plays, (3) the real max usable size.

## Method

- Deployed a throwaway edge function `spike-send-media` (no auth/size cap) that relays a single base64 attachment to a conversation via the Missive Drafts API — **identical to the `send-message` Missive payload**.
- Generated test clips with ffmpeg covering 3 audio formats, 2 video formats, and a size ladder.
- Sent all clips to the user's own Messenger conversation (**JOEY MISA / C000086**) and the user confirmed playback on their phone.
- Function + local test assets deleted after the spike.

## Results

| Clip | Container / codec | Raw size | base64 size | Missive API | Played on phone |
|------|-------------------|---------:|------------:|:-----------:|:---------------:|
| `a1_voice.mp3` | audio MP3 | 0.34 MB | 0.46 MB | 201 ✅ | ✅ |
| `a2_voice.m4a` | audio M4A/AAC | 0.35 MB | 0.47 MB | 201 ✅ | ✅ |
| `a3_voice.webm` | audio **WebM/Opus** | 0.27 MB | 0.36 MB | 201 ✅ | **❌ arrived BLANK** |
| `v1_h264.mp4` | video MP4/H.264+AAC | 0.39 MB | 0.52 MB | 201 ✅ | ✅ |
| `v2_vp8.webm` | video **WebM/VP8+Opus** | 0.93 MB | 1.25 MB | 201 ✅ | ✅ |
| `v3_mp4_3mb.mp4` | video MP4 | 3.15 MB | 4.21 MB | 201 ✅ | ✅ |
| `v4_mp4_5mb.mp4` | video MP4 | 5.15 MB | 6.86 MB | 201 ✅ | ✅ |
| `v5_mp4_7mb.mp4` | video MP4 | 7.06 MB | 9.42 MB | 201 ✅ | ✅ |

## Findings / Decisions

1. **Video WebM plays; audio WebM does NOT.** WebM/VP8 *video* played inline (Facebook re-encodes incoming video on its CDN), so recorded video is sent **as-is**. But audio-only **WebM/Opus arrived BLANK** — Facebook does not transcode an audio-only WebM. Only **MP3** and **M4A/AAC** audio played.
   - **Correction (post-ship):** an initial read of this test wrongly marked `a3_voice.webm` as playing; re-checking on the device showed it never arrived. Voice notes shipped as WebM failed for the same reason.
   - **Fix:** Chrome's `MediaRecorder` can only capture audio as WebM/Opus, so recorded voice notes are **transcoded client-side to AAC/M4A** (via the existing `ffmpeg.wasm` `loadFFmpeg`, see `src/lib/media/transcode-audio.ts`) before sending. Safari records `audio/mp4` directly and skips transcoding. Video still needs no transcoding.

2. **Size is the only real gate.** Every size up to **7.06 MB raw (9.42 MB base64)** was accepted by Missive (201) and played. This is right at Missive's documented **10 MB JSON payload** ceiling, so 7 MB raw is effectively the practical max for a single attachment.

3. **Chosen budget — `MEDIA_MAX_BYTES = 6 MB`** (raw) per recorded clip. 6 MB → ~8.05 MB base64, leaving margin under the 10 MB Missive cap for the message body. Proven-safe (below the 7 MB that worked).
   - Video ~60s fits comfortably: ~6 MB / 60s ≈ 800 kbps total → ample for 480p VP8/H.264 + audio.
   - Audio ~3min @ ~48 kbps Opus ≈ ~1.1 MB — trivially within budget.

4. **Server guard:** keep total draft payload (sum of attachment bytes × 1.34 + body) under **~9 MB** so we never hand Missive a >10 MB payload.

## Caveat

Playback confirmed on the user's own phone (single device). Facebook's server-side re-encoding makes cross-device playback very likely, but if a future report shows a specific platform failing on WebM, the fallback is to record/transcode to MP4/H.264 — not expected to be needed.
