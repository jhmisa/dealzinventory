# Unified Media Capture & Processing Pipeline

**Date:** 2026-03-27
**Status:** Approved

---

## Overview

Replace the 4+ separate media upload/capture/processing implementations with a single unified pipeline. All photos and videos must be square (1:1), compressed, and consistently processed before storage. The pipeline is codec-configurable so formats (AVIF, AV1) can be swapped via config as browser support matures.

## Scope

**In scope:** All media uploads across the application — product photos/videos (Media Studio), kaitori assessment photos, return request media, inspection condition photos.

**Out of scope:** ID document uploads (`id-documents` bucket) — these remain untouched at original quality for legal compliance.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Capture Layer                      │
│  SquareCamera component (desktop + mobile)           │
│  File input (drag-drop / file picker)                │
├─────────────────────────────────────────────────────┤
│                  Processing Layer                    │
│  Image: crop square → 1080 + 256 → WebP/JPEG        │
│  Video: crop square → 1080 → H.264 CRF → MP4        │
├─────────────────────────────────────────────────────┤
│                   Upload Layer                       │
│  Validate → upload to Supabase bucket → return URLs  │
└─────────────────────────────────────────────────────┘
```

### File Structure

| File | Purpose |
|------|---------|
| `src/lib/media/config.ts` | All constants: sizes, quality, codecs, CRF values. Single place to swap formats. |
| `src/lib/media/capture.tsx` | `SquareCamera` component — square viewfinder for photo + video, desktop + mobile. |
| `src/lib/media/process-image.ts` | Image pipeline: square crop → resize (1080 + 256) → compress → strip metadata. |
| `src/lib/media/process-video.ts` | Video pipeline: square crop → 1080x1080 → H.264 CRF → strip audio → MP4 faststart → extract thumbnail. |
| `src/lib/media/upload.ts` | Upload orchestrator: validate → process → upload to Supabase bucket → return URLs. |
| `src/components/shared/media-input.tsx` | Drop-in UI component wrapping capture + file input + processing + upload. |

---

## Config & Constants

`src/lib/media/config.ts`:

```typescript
IMAGE_SIZES: {
  display:   { width: 1080, height: 1080, quality: 0.82 },
  thumbnail: { width: 256,  height: 256,  quality: 0.80 },
}

VIDEO_SPECS: {
  width: 1080,
  height: 1080,
  codec: 'libx264',           // swap to libsvtav1 later for AV1
  crf: 23,
  maxDuration: 60,             // seconds
  maxFileSize: 25_000_000,     // 25MB
  format: 'mp4',
  audio: false,
}

FORMAT_PREFERENCE: {
  image: ['webp', 'jpeg'],     // swap to ['avif', 'webp', 'jpeg'] later
  video: ['mp4'],
}
```

Format detection runs once on app init — checks canvas AVIF/WebP support, caches the result. Adding AVIF later means adding it to the preference array.

---

## SquareCamera Component

`src/lib/media/capture.tsx`

### Props

```typescript
{
  mode: 'photo' | 'video'
  onCapture: (file: File) => void
  onClose: () => void
  maxDuration?: number            // video only, defaults to VIDEO_SPECS.maxDuration
  facingMode?: 'environment' | 'user'  // defaults to 'environment'
}
```

### Behavior

- Uses `getUserMedia` to request the camera at highest available resolution.
- Viewfinder is a square container using CSS `object-fit: cover` to show the centered square crop area.
- On mobile: full-screen overlay so it feels native.
- On desktop: modal/inline depending on usage context.
- Camera flip button to switch front/back; remembers selection per session.

### Photo Capture

1. Draw current video frame onto an offscreen canvas at the square crop dimensions.
2. Export canvas as blob.
3. Pass to `onCapture` as a File.

### Video Recording

1. MediaRecorder captures the full camera stream.
2. Codec preference: `video/webm;codecs=vp9` → `video/webm` → `video/mp4`.
3. Recording indicator + elapsed timer shown in UI.
4. Stop button or auto-stop at `maxDuration`.
5. Raw recording blob passed to `onCapture` — square cropping happens in the processing step.

### Fallback

If `getUserMedia` fails (permission denied, unsupported browser), falls back to a file input with `accept="image/*"` or `accept="video/*"`.

---

## Image Processing Pipeline

`src/lib/media/process-image.ts`

### Input

`File` or `Blob` (from camera capture or file picker).

### Pipeline

1. Load into `HTMLImageElement`.
2. If not square, center-crop to the largest inscribed square.
3. Draw onto canvas at 1080x1080 → export as WebP (or JPEG fallback) at 0.82 quality → **display** blob.
4. Draw onto canvas at 256x256 → export at 0.80 quality → **thumbnail** blob.
5. Return `{ display: Blob, thumbnail: Blob, format: 'webp' | 'jpeg' }`.

### Notes

- Canvas re-encoding inherently strips EXIF/metadata.
- Format determined by `FORMAT_PREFERENCE.image` + runtime capability detection.
- Replaces current `image-processor.ts` — removes the 2048 "full" size entirely.
- `browser-image-compression` dependency can be removed (unused).

### Naming Convention

- `{uuid}_display.webp` — 1080x1080
- `{uuid}_thumb.webp` — 256x256
- (No more `{uuid}_full.webp`)

---

## Video Processing Pipeline

`src/lib/media/process-video.ts`

### Input

`File` or `Blob` (from camera recording or file picker).

### Pipeline (FFmpeg.wasm)

1. Load FFmpeg singleton (lazy, from CDN).
2. Write input file to WASM virtual filesystem.
3. Probe duration — reject if over `maxDuration`.
4. FFmpeg command:
   - Crop to centered square using `crop=min(iw,ih):min(iw,ih)` (crops, not letterboxes).
   - Scale to 1080x1080.
   - H.264 (`libx264`) at CRF 23.
   - Strip all audio tracks (`-an`).
   - MP4 with `+faststart` for streaming.
   - Limit to `maxDuration` seconds.
5. Extract thumbnail: seek to 2 seconds (or first frame if shorter), export a 256x256 JPEG/WebP frame.
6. Read output → validate file size against `maxFileSize`.
7. Return `{ video: Blob, thumbnail: Blob, duration: number, format: 'mp4' }`.

### Notes

- Codec and CRF pulled from config — enables future AV1 swap.
- Progress callback for UI feedback.
- Current `video-processor.ts` letterboxes with black bars; new version center-crops instead.

---

## Upload Orchestrator

`src/lib/media/upload.ts`

### Function

```typescript
uploadMedia({
  file: File | Blob,
  type: 'image' | 'video',
  bucket: string,
  path: string,
  onProgress?: (p: number) => void,
}): Promise<UploadResult>
```

### UploadResult

```typescript
{
  id: string,              // generated UUID
  displayUrl: string,      // 1080x1080 image or 1080x1080 video
  thumbnailUrl: string,    // 256x256
  format: string,
  duration?: number,       // video only
}
```

### Flow

1. Detect type from MIME if not provided.
2. Route to `processImage()` or `processVideo()`.
3. Generate UUID via `crypto.randomUUID()`.
4. Upload processed files to Supabase Storage:
   - Image: `{path}/{uuid}_display.webp` + `{path}/{uuid}_thumb.webp`
   - Video: `{path}/{uuid}.mp4` + `{path}/{uuid}_thumb.webp`
5. Get public URLs via `getPublicUrl()`.
6. Return result.

The orchestrator has no business logic — calling code handles saving DB records (product_media, kaitori_request_media, etc.).

---

## MediaInput Component

`src/components/shared/media-input.tsx` — drop-in UI replacing all current upload UIs.

### Props

```typescript
{
  accept: 'image' | 'video' | 'both'
  bucket: string
  path: string
  onUpload: (result: UploadResult) => void
  onRemove?: (id: string) => void
  multiple?: boolean                // default true
  maxFiles?: number
  showCamera?: boolean              // default true
  enableAiEnhance?: boolean         // default false
  existingMedia?: MediaItem[]
}
```

### UI

1. Grid of existing/uploaded media thumbnails.
2. "Add" button → action sheet: **Take Photo**, **Record Video** (if accept allows), **Choose File**.
3. Take Photo / Record Video → opens `SquareCamera`.
4. Choose File → file picker, processes immediately.
5. Progress indicator during processing + upload.
6. Each thumbnail has a delete button.
7. If `enableAiEnhance` is true, each image thumbnail shows an enhance button → opens existing AI enhance dialog.

### Usage

| Area | Key Props |
|------|-----------|
| Media Studio (products) | `accept="both" enableAiEnhance={true} bucket="photo-group-media"` |
| Kaitori Assessment | `accept="image" bucket="kaitori-media"` |
| Return Requests | `accept="both" bucket="return-media"` |
| Inspection Condition Photos | `accept="image" bucket="item-media"` |

---

## AI Enhancement Rules

- **Available:** Media Studio product photos only (staff-facing).
- **Not available:** Kaitori uploads, return request photos, inspection condition photos, ID documents.
- AI-enhanced images are piped through `processImage()` before storage (ensuring they're square, sized, and compressed like all other media).
- Controlled via `enableAiEnhance` prop on `MediaInput` — defaults to `false`.

---

## Migration from Current Code

### Files to Replace

| Current File | Replaced By |
|---|---|
| `src/components/media-studio/image-processor.ts` | `src/lib/media/process-image.ts` |
| `src/components/media-studio/video-processor.ts` | `src/lib/media/process-video.ts` |
| `src/components/shared/media-uploader.tsx` | `src/components/shared/media-input.tsx` |

### Files to Update (switch to unified pipeline)

| File | Change |
|---|---|
| `src/components/media-studio/photo-section.tsx` | Use `MediaInput` or call `uploadMedia()` directly |
| `src/components/media-studio/video-section.tsx` | Use `MediaInput` or call `uploadMedia()` directly |
| `src/components/media-studio/ai-enhance-dialog.tsx` | Pipe AI output through `processImage()` before upload |
| `src/pages/customer/return-request.tsx` | Replace inline camera + processing with `MediaInput` |
| `src/pages/kaitori/assess.tsx` | Replace `MediaUploader` with `MediaInput` |
| `src/components/inspection/condition-photos-section.tsx` | Replace with `MediaInput` |

### Files Untouched

- `src/pages/customer/verify-id.tsx` — ID documents bypass the pipeline entirely.

### Dependencies to Remove

- `browser-image-compression` — installed but unused, not needed.

### CLAUDE.md Updates

- Remove 2048 "full" size from Image Processing Standards.
- Update naming convention (no more `_full`).
- Update image sizes table.

### Storage Path Convention

No changes to bucket names or path patterns. Only the file naming changes:
- Before: `{uuid}_full.webp`, `{uuid}_display.webp`, `{uuid}_thumb.webp`
- After: `{uuid}_display.webp`, `{uuid}_thumb.webp`

### Existing 2048 Files

Existing `_full.webp` files in storage can remain — nothing references them after migration. They can be cleaned up in a future storage audit.

---

## Codec Upgrade Path

When ready to adopt AV1/AVIF:

1. **AVIF images:** Add `'avif'` to `FORMAT_PREFERENCE.image` array. Format detection will auto-select it on supported browsers.
2. **AV1 video:** Change `VIDEO_SPECS.codec` to `'libsvtav1'`. FFmpeg.wasm command adjusts automatically.
3. No structural changes needed — the pipeline is codec-agnostic by design.
