# Unified Media Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 4+ separate media upload/capture/processing implementations with a single unified pipeline that enforces square 1:1 media, consistent compression, and standardized output across the entire application.

**Architecture:** A layered pipeline — config constants → processing functions (image + video) → upload orchestrator → SquareCamera capture component → MediaInput drop-in UI. Each consumer page swaps out its ad-hoc code for the shared `MediaInput` or calls `uploadMedia()` directly.

**Tech Stack:** Canvas API (image processing), FFmpeg.wasm (video processing), getUserMedia (camera capture), Supabase Storage (upload), React + TypeScript + shadcn/ui (UI components).

**Spec:** `docs/superpowers/specs/2026-03-27-unified-media-pipeline-design.md`

---

## File Structure

### New Files (create)

| File | Purpose |
|------|---------|
| `src/lib/media/config.ts` | All media constants: image sizes, video specs, format preferences |
| `src/lib/media/detect-format.ts` | Runtime format capability detection (WebP/AVIF) |
| `src/lib/media/process-image.ts` | Image pipeline: load → square crop → resize (1080 + 256) → compress |
| `src/lib/media/process-video.ts` | Video pipeline: FFmpeg load → square crop → compress → extract thumbnail |
| `src/lib/media/upload.ts` | Upload orchestrator: process → upload to Supabase → return URLs |
| `src/lib/media/index.ts` | Barrel exports for all media utilities |
| `src/components/shared/square-camera.tsx` | SquareCamera component: square viewfinder for photo + video capture |
| `src/components/shared/media-input.tsx` | MediaInput: drop-in replacement for all upload UIs |

### Files to Modify

| File | Change |
|------|---------|
| `src/components/media-studio/photo-section.tsx` | Replace inline camera + processImage with MediaInput |
| `src/components/media-studio/video-section.tsx` | Replace inline camera + processVideo with MediaInput |
| `src/components/media-studio/ai-enhance-dialog.tsx` | Pipe AI output through processImage before upload |
| `src/pages/customer/return-request.tsx` | Replace ~200 lines of inline camera/processing with MediaInput |
| `src/pages/kaitori/assess.tsx` | Replace MediaUploader with MediaInput |
| `src/components/inspection/condition-photos-section.tsx` | Replace MediaUploader with MediaInput |
| `src/components/items/item-detail/unified-gallery-card.tsx` | Replace direct processImage/processVideo imports with unified pipeline |
| `src/components/shared/media/index.ts` | Add MediaInput to barrel exports |
| `CLAUDE.md` | Update Image Processing Standards (remove 2048 size, update naming) |

### Files to Delete (after all consumers migrated)

| File | Reason |
|------|---------|
| `src/components/media-studio/image-processor.ts` | Replaced by `src/lib/media/process-image.ts` |
| `src/components/media-studio/video-processor.ts` | Replaced by `src/lib/media/process-video.ts` |
| `src/components/shared/media-uploader.tsx` | Replaced by `src/components/shared/media-input.tsx` |

---

## Task 1: Media Config & Format Detection

**Files:**
- Create: `src/lib/media/config.ts`
- Create: `src/lib/media/detect-format.ts`

- [ ] **Step 1: Create `src/lib/media/config.ts`**

```typescript
export const IMAGE_SIZES = {
  display: { width: 1080, height: 1080, quality: 0.82 },
  thumbnail: { width: 256, height: 256, quality: 0.80 },
} as const

export type ImageSizeKey = keyof typeof IMAGE_SIZES

export const VIDEO_SPECS = {
  width: 1080,
  height: 1080,
  codec: 'libx264',
  crf: 23,
  maxDurationSec: 60,
  maxSizeBytes: 25 * 1024 * 1024,
  format: 'mp4',
  audio: false,
} as const

export const FORMAT_PREFERENCE = {
  image: ['webp', 'jpeg'] as const,
  video: ['mp4'] as const,
}
```

- [ ] **Step 2: Create `src/lib/media/detect-format.ts`**

```typescript
let cachedFormat: { mimeType: string; extension: string } | null = null

function detectWebPSupport(): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

export function getImageFormat(): { mimeType: string; extension: string } {
  if (cachedFormat) return cachedFormat

  cachedFormat = detectWebPSupport()
    ? { mimeType: 'image/webp', extension: 'webp' }
    : { mimeType: 'image/jpeg', extension: 'jpeg' }

  return cachedFormat
}
```

- [ ] **Step 3: Verify files exist and TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E 'media/(config|detect-format)' || echo "No errors in new files"`

- [ ] **Step 4: Commit**

```bash
git add src/lib/media/config.ts src/lib/media/detect-format.ts
git commit -m "feat(media): add unified config constants and format detection"
```

---

## Task 2: Image Processing Pipeline

**Files:**
- Create: `src/lib/media/process-image.ts`

- [ ] **Step 1: Create `src/lib/media/process-image.ts`**

```typescript
import { IMAGE_SIZES, type ImageSizeKey } from './config'
import { getImageFormat } from './detect-format'

export interface ProcessedImage {
  id: string
  display: Blob
  thumbnail: Blob
  format: string
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-')
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

function resizeAndCompress(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Could not get canvas 2d context'))
      return
    }

    const srcSize = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - srcSize) / 2
    const sy = (img.naturalHeight - srcSize) / 2

    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, targetWidth, targetHeight)

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob returned null'))
      },
      mimeType,
      quality,
    )
  })
}

export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  const img = await loadImage(file)
  const { mimeType, extension } = getImageFormat()
  const id = generateId()

  const [display, thumbnail] = await Promise.all(
    (['display', 'thumbnail'] as ImageSizeKey[]).map((key) => {
      const { width, height, quality } = IMAGE_SIZES[key]
      return resizeAndCompress(img, width, height, quality, mimeType)
    }),
  )

  return { id, display, thumbnail, format: extension }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'media/process-image' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/lib/media/process-image.ts
git commit -m "feat(media): add unified image processing pipeline (1080 + 256)"
```

---

## Task 3: Video Processing Pipeline

**Files:**
- Create: `src/lib/media/process-video.ts`

- [ ] **Step 1: Create `src/lib/media/process-video.ts`**

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { VIDEO_SPECS } from './config'
import { getImageFormat } from './detect-format'

export interface ProcessedVideo {
  video: Blob
  thumbnail: Blob
  id: string
  duration: number
  format: string
}

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<void> | null = null

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript')
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      await ffmpeg.load({ coreURL, wasmURL })
      ffmpegInstance = ffmpeg
    })()
  }

  await loadPromise

  if (!ffmpegInstance) {
    loadPromise = null
    throw new Error('FFmpeg failed to load')
  }

  return ffmpegInstance
}

async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // file may not exist
  }
}

async function probeDuration(ffmpeg: FFmpeg, fileName: string): Promise<number> {
  const probeOutput = 'probe.txt'
  try {
    const code = await ffmpeg.ffprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      fileName,
      '-o', probeOutput,
    ])
    if (code !== 0) return 0
    const raw = await ffmpeg.readFile(probeOutput)
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
    const parsed = parseFloat(text.trim())
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  } finally {
    await safeDelete(ffmpeg, probeOutput)
  }
}

async function extractThumbnail(ffmpeg: FFmpeg, inputFile: string): Promise<Blob> {
  const thumbFile = 'thumb.jpg'
  const { mimeType } = getImageFormat()
  const isWebP = mimeType === 'image/webp'
  const outFile = isWebP ? 'thumb.webp' : thumbFile

  try {
    const exitCode = await ffmpeg.exec([
      '-i', inputFile,
      '-ss', '2',
      '-vframes', '1',
      '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=256:256',
      '-q:v', '2',
      outFile,
    ])

    // If seeking to 2s fails (video shorter than 2s), try first frame
    if (exitCode !== 0) {
      await safeDelete(ffmpeg, outFile)
      await ffmpeg.exec([
        '-i', inputFile,
        '-vframes', '1',
        '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=256:256',
        '-q:v', '2',
        outFile,
      ])
    }

    const data = await ffmpeg.readFile(outFile)
    if (typeof data === 'string') throw new Error('Unexpected string from readFile')
    return new Blob([data.buffer], { type: isWebP ? 'image/webp' : 'image/jpeg' })
  } finally {
    await safeDelete(ffmpeg, outFile)
  }
}

export async function processVideo(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<ProcessedVideo> {
  const ffmpeg = await loadFFmpeg()

  const inputName = 'input.mp4'
  const outputName = 'output.mp4'

  const progressHandler = ({ progress }: { progress: number; time: number }) => {
    onProgress?.(Math.min(Math.max(progress, 0), 1))
  }

  ffmpeg.on('progress', progressHandler)

  try {
    const inputData = await fetchFile(file)
    await ffmpeg.writeFile(inputName, inputData)

    const { width, height, maxDurationSec, crf, codec } = VIDEO_SPECS

    const vf = [
      `crop=min(iw\\,ih):min(iw\\,ih)`,
      `scale=${width}:${height}`,
    ].join(',')

    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-an',
      '-vf', vf,
      '-c:v', codec,
      '-crf', String(crf),
      '-t', String(maxDurationSec),
      '-movflags', '+faststart',
      outputName,
    ])

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}`)
    }

    const outputData = await ffmpeg.readFile(outputName)
    if (typeof outputData === 'string') {
      throw new Error('Unexpected string output from FFmpeg readFile')
    }

    const videoBlob = new Blob([outputData.buffer], { type: 'video/mp4' })
    const duration = await probeDuration(ffmpeg, outputName)
    const thumbnail = await extractThumbnail(ffmpeg, outputName)
    const id = crypto.randomUUID()

    return {
      video: videoBlob,
      thumbnail,
      id,
      duration,
      format: 'mp4',
    }
  } finally {
    ffmpeg.off('progress', progressHandler)
    await safeDelete(ffmpeg, inputName)
    await safeDelete(ffmpeg, outputName)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'media/process-video' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/lib/media/process-video.ts
git commit -m "feat(media): add unified video processing with square crop + thumbnail extraction"
```

---

## Task 4: Upload Orchestrator

**Files:**
- Create: `src/lib/media/upload.ts`
- Create: `src/lib/media/index.ts`

- [ ] **Step 1: Create `src/lib/media/upload.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import { processImage, type ProcessedImage } from './process-image'
import { processVideo, type ProcessedVideo } from './process-video'
import { getImageFormat } from './detect-format'

export interface UploadResult {
  id: string
  displayUrl: string
  thumbnailUrl: string
  format: string
  duration?: number
}

interface UploadMediaOptions {
  file: File | Blob
  type: 'image' | 'video'
  bucket: string
  path: string
  onProgress?: (progress: number) => void
}

function detectMediaType(file: File | Blob): 'image' | 'video' {
  const mimeType = file.type || ''
  if (mimeType.startsWith('video/')) return 'video'
  return 'image'
}

export async function uploadMedia(options: UploadMediaOptions): Promise<UploadResult> {
  const { file, bucket, path, onProgress } = options
  const type = options.type ?? detectMediaType(file)

  if (type === 'image') {
    return uploadImage(file, bucket, path)
  } else {
    return uploadVideo(file, bucket, path, onProgress)
  }
}

async function uploadImage(file: File | Blob, bucket: string, path: string): Promise<UploadResult> {
  const processed = await processImage(file)
  const { extension } = getImageFormat()

  const displayPath = `${path}/${processed.id}_display.${extension}`
  const thumbPath = `${path}/${processed.id}_thumb.${extension}`
  const contentType = extension === 'webp' ? 'image/webp' : 'image/jpeg'

  const [displayResult, thumbResult] = await Promise.all([
    supabase.storage.from(bucket).upload(displayPath, processed.display, { contentType, upsert: false }),
    supabase.storage.from(bucket).upload(thumbPath, processed.thumbnail, { contentType, upsert: false }),
  ])

  if (displayResult.error) throw displayResult.error
  if (thumbResult.error) throw thumbResult.error

  const { data: displayUrl } = supabase.storage.from(bucket).getPublicUrl(displayPath)
  const { data: thumbUrl } = supabase.storage.from(bucket).getPublicUrl(thumbPath)

  return {
    id: processed.id,
    displayUrl: displayUrl.publicUrl,
    thumbnailUrl: thumbUrl.publicUrl,
    format: extension,
  }
}

async function uploadVideo(
  file: File | Blob,
  bucket: string,
  path: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResult> {
  const processed = await processVideo(file, onProgress)
  const { extension: imgExt } = getImageFormat()

  const videoPath = `${path}/${processed.id}.mp4`
  const thumbPath = `${path}/${processed.id}_thumb.${imgExt}`
  const thumbContentType = imgExt === 'webp' ? 'image/webp' : 'image/jpeg'

  const [videoResult, thumbResult] = await Promise.all([
    supabase.storage.from(bucket).upload(videoPath, processed.video, { contentType: 'video/mp4', upsert: false }),
    supabase.storage.from(bucket).upload(thumbPath, processed.thumbnail, { contentType: thumbContentType, upsert: false }),
  ])

  if (videoResult.error) throw videoResult.error
  if (thumbResult.error) throw thumbResult.error

  const { data: videoUrl } = supabase.storage.from(bucket).getPublicUrl(videoPath)
  const { data: thumbUrl } = supabase.storage.from(bucket).getPublicUrl(thumbPath)

  return {
    id: processed.id,
    displayUrl: videoUrl.publicUrl,
    thumbnailUrl: thumbUrl.publicUrl,
    format: 'mp4',
    duration: processed.duration,
  }
}
```

- [ ] **Step 2: Create `src/lib/media/index.ts`**

```typescript
export { IMAGE_SIZES, VIDEO_SPECS, FORMAT_PREFERENCE } from './config'
export type { ImageSizeKey } from './config'
export { getImageFormat } from './detect-format'
export { processImage } from './process-image'
export type { ProcessedImage } from './process-image'
export { processVideo, loadFFmpeg } from './process-video'
export type { ProcessedVideo } from './process-video'
export { uploadMedia } from './upload'
export type { UploadResult } from './upload'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'lib/media' || echo "No errors"`

- [ ] **Step 4: Commit**

```bash
git add src/lib/media/upload.ts src/lib/media/index.ts
git commit -m "feat(media): add upload orchestrator and barrel exports"
```

---

## Task 5: SquareCamera Component

**Files:**
- Create: `src/components/shared/square-camera.tsx`

- [ ] **Step 1: Create `src/components/shared/square-camera.tsx`**

```tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, X, CircleDot, Square, SwitchCamera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { VIDEO_SPECS } from '@/lib/media'
import { cn } from '@/lib/utils'

interface SquareCameraProps {
  mode: 'photo' | 'video'
  onCapture: (file: File) => void
  onClose: () => void
  maxDuration?: number
  facingMode?: 'environment' | 'user'
}

export function SquareCamera({
  mode,
  onCapture,
  onClose,
  maxDuration = VIDEO_SPECS.maxDurationSec,
  facingMode: initialFacing = 'environment',
}: SquareCameraProps) {
  const [facing, setFacing] = useState(initialFacing)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [hasStream, setHasStream] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setHasStream(false)
  }, [])

  const startStream = useCallback(async (face: 'environment' | 'user') => {
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      setHasStream(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera'
      toast.error(`Camera error: ${message}`)
      onClose()
    }
  }, [stopStream, onClose])

  useEffect(() => {
    startStream(facing)
    return () => {
      stopStream()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFlipCamera() {
    const newFacing = facing === 'environment' ? 'user' : 'environment'
    setFacing(newFacing)
    startStream(newFacing)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return

    // Compute square crop from the video feed
    const vw = video.videoWidth
    const vh = video.videoHeight
    const size = Math.min(vw, vh)
    const sx = (vw - size) / 2
    const sy = (vh - size) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
      },
      'image/jpeg',
      0.92,
    )
  }

  function startRecording() {
    if (!streamRef.current) return

    chunksRef.current = []

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
      const file = new File([blob], `recording_${Date.now()}.${ext}`, { type: mimeType })
      onCapture(file)
    }

    recorder.start(1000)
    recorderRef.current = recorder
    setRecording(true)
    setRecordingTime(0)

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const next = prev + 1
        if (next >= maxDuration) {
          stopRecording()
        }
        return next
      })
    }, 1000)
  }

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setRecording(false)
  }, [])

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center md:relative md:inset-auto md:z-auto md:rounded-lg md:overflow-hidden md:border">
      {/* Square viewfinder */}
      <div className="relative w-full max-w-[min(100vw,100vh)] aspect-square bg-black overflow-hidden">
        {hasStream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Recording indicator */}
        {recording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 z-10">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-sm font-mono">
              {formatTime(recordingTime)} / {formatTime(maxDuration)}
            </span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-4 py-6 bg-black w-full">
        {/* Flip camera */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-10 w-10 text-white hover:bg-white/20"
          onClick={handleFlipCamera}
          disabled={recording}
          title="Switch camera"
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>

        {/* Main action button */}
        {mode === 'photo' ? (
          <Button
            size="lg"
            className="rounded-full h-16 w-16 shadow-lg bg-white hover:bg-white/90"
            onClick={capturePhoto}
            title="Capture photo"
          >
            <Camera className="h-7 w-7 text-black" />
          </Button>
        ) : !recording ? (
          <Button
            size="lg"
            variant="destructive"
            className="rounded-full h-16 w-16 shadow-lg"
            onClick={startRecording}
            title="Start recording"
          >
            <CircleDot className="h-7 w-7" />
          </Button>
        ) : (
          <Button
            size="lg"
            variant="destructive"
            className="rounded-full h-16 w-16 shadow-lg"
            onClick={stopRecording}
            title="Stop recording"
          >
            <Square className="h-6 w-6" />
          </Button>
        )}

        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-10 w-10 text-white hover:bg-white/20"
          onClick={() => {
            stopRecording()
            stopStream()
            onClose()
          }}
          title="Close camera"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'square-camera' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/square-camera.tsx
git commit -m "feat(media): add SquareCamera component with photo + video capture"
```

---

## Task 6: MediaInput Component

**Files:**
- Create: `src/components/shared/media-input.tsx`
- Modify: `src/components/shared/media/index.ts`

- [ ] **Step 1: Create `src/components/shared/media-input.tsx`**

```tsx
import { useState, useRef, useCallback } from 'react'
import { Upload, Camera, Video, X, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { uploadMedia, type UploadResult } from '@/lib/media'
import { SquareCamera } from './square-camera'
import { cn } from '@/lib/utils'

export interface MediaItem {
  id: string
  url: string
  thumbnailUrl?: string
  type: 'image' | 'video'
}

interface MediaInputProps {
  accept: 'image' | 'video' | 'both'
  bucket: string
  path: string
  onUpload: (result: UploadResult) => void
  onRemove?: (id: string) => void
  multiple?: boolean
  maxFiles?: number
  showCamera?: boolean
  enableAiEnhance?: boolean
  onEnhance?: (imageUrl: string) => void
  existingMedia?: MediaItem[]
  className?: string
}

interface UploadingItem {
  key: string
  fileName: string
  stage: 'processing' | 'uploading'
  progress: number
}

export function MediaInput({
  accept,
  bucket,
  path,
  onUpload,
  onRemove,
  multiple = true,
  maxFiles,
  showCamera = true,
  enableAiEnhance = false,
  onEnhance,
  existingMedia = [],
  className,
}: MediaInputProps) {
  const [uploading, setUploading] = useState<UploadingItem[]>([])
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalCount = existingMedia.length + uploading.length
  const atLimit = maxFiles != null && totalCount >= maxFiles

  const acceptMime =
    accept === 'image' ? 'image/*' :
    accept === 'video' ? 'video/*' :
    'image/*,video/*'

  const processAndUpload = useCallback(async (file: File) => {
    const key = `${file.name}-${Date.now()}`
    const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image'

    setUploading((prev) => [...prev, { key, fileName: file.name, stage: 'processing', progress: 0 }])

    try {
      setUploading((prev) =>
        prev.map((u) => (u.key === key ? { ...u, stage: 'processing', progress: 20 } : u)),
      )

      const result = await uploadMedia({
        file,
        type,
        bucket,
        path,
        onProgress: (p) => {
          setUploading((prev) =>
            prev.map((u) => (u.key === key ? { ...u, stage: 'uploading', progress: 20 + Math.round(p * 60) } : u)),
          )
        },
      })

      setUploading((prev) =>
        prev.map((u) => (u.key === key ? { ...u, progress: 100 } : u)),
      )

      onUpload(result)
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed: ${message}`)
    } finally {
      setTimeout(() => {
        setUploading((prev) => prev.filter((u) => u.key !== key))
      }, 500)
    }
  }, [bucket, path, onUpload])

  function handleFiles(files: FileList | null) {
    if (!files) return
    const remaining = maxFiles != null ? maxFiles - totalCount : files.length
    const toProcess = Array.from(files).slice(0, Math.max(remaining, 0))
    toProcess.forEach(processAndUpload)
  }

  function handleCameraCapture(file: File) {
    setCameraMode(null)
    processAndUpload(file)
  }

  const showPhotoBtn = showCamera && (accept === 'image' || accept === 'both')
  const showVideoBtn = showCamera && (accept === 'video' || accept === 'both')

  return (
    <div className={cn('space-y-4', className)}>
      {/* Action buttons */}
      {!atLimit && !cameraMode && (
        <div className="flex flex-wrap gap-2">
          {showPhotoBtn && (
            <Button variant="outline" onClick={() => setCameraMode('photo')} className="gap-2">
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>
          )}
          {showVideoBtn && (
            <Button variant="outline" onClick={() => setCameraMode('video')} className="gap-2">
              <Video className="h-4 w-4" />
              Record Video
            </Button>
          )}
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptMime}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* Camera */}
      {cameraMode && (
        <SquareCamera
          mode={cameraMode}
          onCapture={handleCameraCapture}
          onClose={() => setCameraMode(null)}
        />
      )}

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((item) => (
            <div key={item.key} className="flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span className="truncate flex-1">{item.fileName}</span>
              <span className="text-muted-foreground text-xs capitalize">{item.stage}</span>
              <span className="text-muted-foreground w-10 text-right">{item.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Existing media grid */}
      {existingMedia.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {existingMedia.map((item) => (
            <div key={item.id} className="group space-y-2">
              <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                {item.type === 'video' ? (
                  <video src={item.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                {enableAiEnhance && item.type === 'image' && onEnhance && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => onEnhance(item.url)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Enhance
                  </Button>
                )}
                {onRemove && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (window.confirm('Delete this media?')) onRemove(item.id)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File count */}
      {maxFiles != null && (
        <p className="text-xs text-muted-foreground">
          {existingMedia.length}/{maxFiles} files
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update barrel exports**

In `src/components/shared/media/index.ts`, add:

```typescript
export { MediaInput } from '../media-input'
export type { MediaItem } from '../media-input'
```

(Keep existing exports for `QRScannerCamera`, `MediaUploader`, `ImageGallery`, `GalleryImage` — they'll be removed later once all consumers are migrated.)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'media-input\|square-camera' || echo "No errors"`

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/media-input.tsx src/components/shared/media/index.ts
git commit -m "feat(media): add MediaInput drop-in UI component"
```

---

## Task 7: Migrate Media Studio — PhotoSection

**Files:**
- Modify: `src/components/media-studio/photo-section.tsx`

- [ ] **Step 1: Rewrite PhotoSection to use MediaInput**

Replace the entire file content with:

```tsx
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MediaInput, type MediaItem } from '@/components/shared/media-input'
import { AiEnhanceDialog } from './ai-enhance-dialog'
import { useAddProductMedia, useDeleteProductMedia } from '@/hooks/use-product-models'
import type { UploadResult } from '@/lib/media'
import { cn } from '@/lib/utils'

interface ProductMediaItem {
  id: string
  file_url: string
  media_type: string
  role: string
  sort_order: number
}

interface PhotoSectionProps {
  productId: string
  existingMedia: ProductMediaItem[]
  className?: string
}

const BUCKET = 'photo-group-media'

export function PhotoSection({ productId, existingMedia, className }: PhotoSectionProps) {
  const [enhanceImageUrl, setEnhanceImageUrl] = useState<string | null>(null)
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false)

  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  const photos = existingMedia.filter((m) => m.media_type === 'image')

  function handleUpload(result: UploadResult) {
    addMediaMutation.mutate(
      { productId, fileUrl: result.displayUrl, role: 'gallery', mediaType: 'image' },
      {
        onError: (err) => toast.error(`Failed to save media record: ${err.message}`),
      },
    )
  }

  function handleDelete(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onSuccess: () => toast.success('Photo deleted'),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    })
  }

  function handleEnhance(imageUrl: string) {
    setEnhanceImageUrl(imageUrl)
    setEnhanceDialogOpen(true)
  }

  const mediaItems: MediaItem[] = photos.map((p) => ({
    id: p.id,
    url: p.file_url,
    type: 'image' as const,
  }))

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MediaInput
            accept="image"
            bucket={BUCKET}
            path={`product-media/${productId}`}
            onUpload={handleUpload}
            onRemove={handleDelete}
            enableAiEnhance
            onEnhance={handleEnhance}
            existingMedia={mediaItems}
          />
        </CardContent>
      </Card>

      {photos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Upload className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No photos yet. Upload images above to get started.</p>
        </div>
      )}

      <AiEnhanceDialog
        open={enhanceDialogOpen}
        onOpenChange={setEnhanceDialogOpen}
        originalImageUrl={enhanceImageUrl}
        productId={productId}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'photo-section' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/components/media-studio/photo-section.tsx
git commit -m "refactor(media-studio): migrate PhotoSection to unified MediaInput"
```

---

## Task 8: Migrate Media Studio — VideoSection

**Files:**
- Modify: `src/components/media-studio/video-section.tsx`

- [ ] **Step 1: Rewrite VideoSection to use MediaInput**

Replace the entire file content with:

```tsx
import { Video, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MediaInput, type MediaItem } from '@/components/shared/media-input'
import { useAddProductMedia, useDeleteProductMedia } from '@/hooks/use-product-models'
import type { UploadResult } from '@/lib/media'
import { cn } from '@/lib/utils'

interface ProductMediaItem {
  id: string
  file_url: string
  media_type: string
  role: string
  sort_order: number
}

interface VideoSectionProps {
  productId: string
  existingMedia: ProductMediaItem[]
  className?: string
}

const BUCKET = 'photo-group-media'

export function VideoSection({ productId, existingMedia, className }: VideoSectionProps) {
  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  const videos = existingMedia.filter((m) => m.media_type === 'video')

  function handleUpload(result: UploadResult) {
    addMediaMutation.mutate(
      { productId, fileUrl: result.displayUrl, role: 'gallery', mediaType: 'video' },
      {
        onError: (err) => toast.error(`Failed to save media record: ${err.message}`),
      },
    )
  }

  function handleDelete(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onSuccess: () => toast.success('Video deleted'),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    })
  }

  const mediaItems: MediaItem[] = videos.map((v) => ({
    id: v.id,
    url: v.file_url,
    type: 'video' as const,
  }))

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-4 w-4" />
            Upload Video
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MediaInput
            accept="video"
            bucket={BUCKET}
            path={`product-media/${productId}`}
            onUpload={handleUpload}
            onRemove={handleDelete}
            existingMedia={mediaItems}
          />
        </CardContent>
      </Card>

      {videos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Video className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No videos yet. Upload a video above to get started.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'video-section' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/components/media-studio/video-section.tsx
git commit -m "refactor(media-studio): migrate VideoSection to unified MediaInput"
```

---

## Task 9: Update AI Enhance Dialog — Pipe Through Pipeline

**Files:**
- Modify: `src/components/media-studio/ai-enhance-dialog.tsx`

- [ ] **Step 1: Import processImage from unified pipeline**

In `src/components/media-studio/ai-enhance-dialog.tsx`, add import at top:

```typescript
import { processImage } from '@/lib/media'
```

- [ ] **Step 2: Update handleSave to process AI output through pipeline**

Replace the `handleSave` function (lines 204-245) with:

```typescript
  async function handleSave() {
    if (!enhancedUrl) return

    setSaving(true)

    try {
      // Fetch the enhanced image
      const imageResponse = await fetch(enhancedUrl)
      if (!imageResponse.ok) throw new Error('Failed to download enhanced image')
      const rawBlob = await imageResponse.blob()

      // Process through unified pipeline (square crop + resize + compress)
      const processed = await processImage(rawBlob)

      const basePath = `product-media/${productId}`
      const displayPath = `${basePath}/${processed.id}_display.webp`
      const thumbPath = `${basePath}/${processed.id}_thumb.webp`

      const [displayResult, thumbResult] = await Promise.all([
        supabase.storage.from(BUCKET).upload(displayPath, processed.display, {
          contentType: 'image/webp',
          upsert: false,
        }),
        supabase.storage.from(BUCKET).upload(thumbPath, processed.thumbnail, {
          contentType: 'image/webp',
          upsert: false,
        }),
      ])

      if (displayResult.error) throw displayResult.error
      if (thumbResult.error) throw thumbResult.error

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(displayPath)

      addMediaMutation.mutate(
        { productId, fileUrl: urlData.publicUrl, role: 'gallery', mediaType: 'image' },
        {
          onSuccess: () => {
            toast.success('Enhanced image saved')
            handleClose()
          },
          onError: (err) => {
            toast.error(`Failed to save: ${err.message}`)
          },
        },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Save failed: ${message}`)
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'ai-enhance-dialog' || echo "No errors"`

- [ ] **Step 4: Commit**

```bash
git add src/components/media-studio/ai-enhance-dialog.tsx
git commit -m "refactor(media-studio): pipe AI enhanced images through unified pipeline"
```

---

## Task 10: Migrate Return Request Page

**Files:**
- Modify: `src/pages/customer/return-request.tsx`

- [ ] **Step 1: Replace camera/processing code with MediaInput**

This page has ~200 lines of inline camera + processing code. Replace with MediaInput. The key change: instead of accumulating local `mediaItems` blobs, we upload immediately via MediaInput and collect `UploadResult`s.

However, the current flow uploads media *after* the return request is created (needs the `returnRequestId`). Since MediaInput uploads immediately, we need to either:
- Upload to a temp path, then move after creation, OR
- Keep the current deferred-upload pattern for the submit step, but use MediaInput for capture/processing only

The simplest approach: use MediaInput with a temp path (`return-media/pending-{orderId}`) and store the results. On submit, the media is already uploaded — just create the DB records linking them to the return request.

Replace the imports and media-related state/functions. The full rewrite of the file:

Remove these imports:
```typescript
// REMOVE:
import { processReturnImage } from '@/components/media-studio/image-processor'
import { processVideo, VIDEO_SPECS } from '@/components/media-studio/video-processor'
```

Add this import:
```typescript
import { MediaInput } from '@/components/shared/media-input'
import type { UploadResult } from '@/lib/media'
```

Remove all of these state variables and their related functions (lines 59-78, camera/recording state):
```typescript
// REMOVE all of:
const fileInputRef = useRef<HTMLInputElement>(null)
const cameraInputRef = useRef<HTMLInputElement>(null)
const videoInputRef = useRef<HTMLInputElement>(null)
const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
const [processing, setProcessing] = useState(false)
const [processProgress, setProcessProgress] = useState(0)
const [processLabel, setProcessLabel] = useState('')
const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)
const [recording, setRecording] = useState(false)
const [recordingTime, setRecordingTime] = useState(0)
const videoRef = useRef<HTMLVideoElement>(null)
const streamRef = useRef<MediaStream | null>(null)
const recorderRef = useRef<MediaRecorder | null>(null)
const chunksRef = useRef<Blob[]>([])
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
```

Replace with:
```typescript
const [uploadedMedia, setUploadedMedia] = useState<UploadResult[]>([])
```

Remove all the inline camera/processing functions: `addProcessedMedia`, `processAndAddImage`, `processAndAddVideo`, `handleFileUpload`, `removeMediaItem`, `handleTakePhoto`, `handleRecordVideo`, `openCamera`, `closeCamera`, `capturePhoto`, `startRecording`, `stopRecording`, `formatTime`, and the cleanup useEffect.

Replace the Step 3 JSX (lines 506-677, the "Upload Evidence" card content) with:

```tsx
{step === 2 && (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Upload evidence</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Take photos or record a video showing the issue. Up to 5 files — all media is automatically compressed.
      </p>

      <MediaInput
        accept="both"
        bucket="return-media"
        path={`pending-${orderId}`}
        onUpload={(result) => setUploadedMedia((prev) => [...prev, result])}
        maxFiles={5}
        existingMedia={uploadedMedia.map((r) => ({
          id: r.id,
          url: r.displayUrl,
          thumbnailUrl: r.thumbnailUrl,
          type: r.format === 'mp4' ? 'video' as const : 'image' as const,
        }))}
        onRemove={(id) => setUploadedMedia((prev) => prev.filter((r) => r.id !== id))}
      />
    </CardContent>
  </Card>
)}
```

Update the Review step (Step 4) to reference `uploadedMedia` instead of `mediaItems`:

Replace `mediaItems.length` with `uploadedMedia.length` and the thumbnail grid:

```tsx
{uploadedMedia.length > 0 && (
  <div className="border-t pt-3">
    <p className="text-xs text-muted-foreground mb-1">Attached files ({uploadedMedia.length})</p>
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
      {uploadedMedia.map((item) => (
        <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border">
          {item.format === 'mp4' ? (
            <video src={item.displayUrl} className="w-full h-full object-cover" />
          ) : (
            <img src={item.displayUrl} alt="Evidence" className="w-full h-full object-cover" />
          )}
          {item.format === 'mp4' && (
            <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
              <Video className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

Update `handleSubmit` to use `uploadedMedia` URLs instead of uploading blobs:

```typescript
// Instead of uploading blobs, create DB records for already-uploaded media
for (const item of uploadedMedia) {
  await supabase
    .from('return_request_media')
    .insert({
      return_request_id: returnId,
      file_url: item.displayUrl,
      media_type: item.format === 'mp4' ? 'video' : 'image',
    })
}
```

Remove the `isMobile` constant, the `MediaItem` interface, and the `MAX_FILES` constant (MediaInput handles the limit).

Remove unused imports: `Camera, Video, CircleDot, Square, Progress`, `useUploadReturnMedia`, `processReturnImage`, `processVideo`, `VIDEO_SPECS`.

Keep the `Video` import since it's used in the review step thumbnail overlay.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'return-request' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/pages/customer/return-request.tsx
git commit -m "refactor(returns): replace inline camera/processing with unified MediaInput"
```

---

## Task 11: Migrate Kaitori Assessment Page

**Files:**
- Modify: `src/pages/kaitori/assess.tsx`

- [ ] **Step 1: Replace MediaUploader with MediaInput**

In `src/pages/kaitori/assess.tsx`:

Replace import:
```typescript
// REMOVE:
import { MediaUploader } from '@/components/shared/media'
// ADD:
import { MediaInput } from '@/components/shared/media'
import type { UploadResult } from '@/lib/media'
```

Change state type:
```typescript
// REMOVE:
const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([])
// ADD:
const [uploadedPhotos, setUploadedPhotos] = useState<UploadResult[]>([])
```

Replace the MediaUploader usage in Step 3 (line 336-340):
```tsx
// REMOVE:
<MediaUploader
  bucket="kaitori-media"
  pathPrefix="temp-assessment"
  onUpload={(url) => setUploadedPhotos(prev => [...prev, url])}
/>
// ADD:
<MediaInput
  accept="image"
  bucket="kaitori-media"
  path="temp-assessment"
  onUpload={(result) => setUploadedPhotos((prev) => [...prev, result])}
  existingMedia={uploadedPhotos.map((r) => ({
    id: r.id,
    url: r.displayUrl,
    type: 'image' as const,
  }))}
  onRemove={(id) => setUploadedPhotos((prev) => prev.filter((r) => r.id !== id))}
/>
```

Remove the manual thumbnails grid below (lines 341-349) — MediaInput renders its own grid.

Update `handleSubmit` to use `UploadResult` URLs:
```typescript
// REMOVE:
for (const url of uploadedPhotos) {
  await addMediaMutation.mutateAsync({ kaitoriRequestId: request.id, fileUrl: url, role: 'other' })
}
// ADD:
for (const photo of uploadedPhotos) {
  await addMediaMutation.mutateAsync({ kaitoriRequestId: request.id, fileUrl: photo.displayUrl, role: 'other' })
}
```

Update the summary count:
```typescript
// REMOVE:
<span>{uploadedPhotos.length} uploaded</span>
// This stays the same since .length works on both types
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'kaitori/assess' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/pages/kaitori/assess.tsx
git commit -m "refactor(kaitori): replace MediaUploader with unified MediaInput"
```

---

## Task 12: Migrate Condition Photos Section

**Files:**
- Modify: `src/components/inspection/condition-photos-section.tsx`

- [ ] **Step 1: Replace MediaUploader with MediaInput**

Replace the entire file:

```tsx
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MediaInput } from '@/components/shared/media-input'
import { useAddItemMedia, useDeleteItemMedia } from '@/hooks/use-items'
import type { UploadResult } from '@/lib/media'
import type { ItemMedia } from '@/lib/types'

interface ConditionPhotosSectionProps {
  itemId: string
  media: ItemMedia[]
}

export function ConditionPhotosSection({ itemId, media }: ConditionPhotosSectionProps) {
  const addMedia = useAddItemMedia()
  const deleteMedia = useDeleteItemMedia()

  function handleUpload(result: UploadResult) {
    addMedia.mutate(
      { itemId, fileUrl: result.displayUrl, description: 'Inspection photo' },
      {
        onError: () => toast.error('Failed to save photo'),
      },
    )
  }

  function handleDelete(mediaId: string) {
    deleteMedia.mutate(
      { mediaId, itemId },
      {
        onSuccess: () => toast.success('Photo removed'),
        onError: () => toast.error('Failed to remove photo'),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Condition Photos</CardTitle>
      </CardHeader>
      <CardContent>
        <MediaInput
          accept="image"
          bucket="item-media"
          path={`items/${itemId}`}
          onUpload={handleUpload}
          onRemove={handleDelete}
          existingMedia={media.map((m) => ({
            id: m.id,
            url: m.file_url,
            type: 'image' as const,
          }))}
        />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'condition-photos' || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add src/components/inspection/condition-photos-section.tsx
git commit -m "refactor(inspection): replace MediaUploader with unified MediaInput"
```

---

## Task 13: Migrate Unified Gallery Card

**Files:**
- Modify: `src/components/items/item-detail/unified-gallery-card.tsx`

- [ ] **Step 1: Update imports to use unified pipeline**

In `src/components/items/item-detail/unified-gallery-card.tsx`:

Replace:
```typescript
import { processImage } from '@/components/media-studio/image-processor'
import { processVideo, VIDEO_SPECS } from '@/components/media-studio/video-processor'
```

With:
```typescript
import { processImage, processVideo, VIDEO_SPECS } from '@/lib/media'
```

The rest of the component can stay the same — it uses `processImage` and `processVideo` directly (not the full MediaInput) because of its specialized drag-and-drop gallery with reordering. The function signatures are compatible.

Note: The old `processImage` returned `{ id, full, display, thumbnail }`. The new one returns `{ id, display, thumbnail, format }` — no `full` property. Find any references to `processed.full` in this file and remove them. The upload loop should only upload `display` and `thumbnail`.

- [ ] **Step 2: Update the upload logic to remove full size**

Search for the sizes array in this file and remove the `full` entry. Update the upload to use only display + thumbnail.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep 'unified-gallery-card' || echo "No errors"`

- [ ] **Step 4: Commit**

```bash
git add src/components/items/item-detail/unified-gallery-card.tsx
git commit -m "refactor(gallery): use unified media pipeline, remove 2048 full size"
```

---

## Task 14: Delete Old Files & Clean Up

**Files:**
- Delete: `src/components/media-studio/image-processor.ts`
- Delete: `src/components/media-studio/video-processor.ts`
- Delete: `src/components/shared/media-uploader.tsx`
- Modify: `src/components/shared/media/index.ts`

- [ ] **Step 1: Verify no remaining imports of old files**

Run:
```bash
grep -r "media-studio/image-processor\|media-studio/video-processor\|shared/media-uploader" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (all consumers migrated). If any remain, fix them first.

- [ ] **Step 2: Delete old files**

```bash
rm src/components/media-studio/image-processor.ts
rm src/components/media-studio/video-processor.ts
rm src/components/shared/media-uploader.tsx
```

- [ ] **Step 3: Update barrel export to remove MediaUploader**

In `src/components/shared/media/index.ts`, remove:
```typescript
export { MediaUploader } from '../media-uploader'
```

Final content:
```typescript
export { QRScannerCamera } from '../qr-scanner-camera'
export { ImageGallery } from '../image-gallery'
export type { GalleryImage } from '../image-gallery'
export { MediaInput } from '../media-input'
export type { MediaItem } from '../media-input'
```

- [ ] **Step 4: Remove `browser-image-compression` dependency**

```bash
npm uninstall browser-image-compression
```

- [ ] **Step 5: Verify TypeScript compiles (full project)**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(media): delete old processors and media-uploader, remove browser-image-compression"
```

---

## Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update Image Processing Standards section**

In `CLAUDE.md`, update the Image Processing Standards section:

Replace the three sizes with two:
```markdown
- **Display**: 1080x1080px — for product pages, galleries, and zoom
- **Thumbnail**: 256x256px — for cards, lists, and grids
```

Update compression qualities:
```markdown
- **Compression**: Display 82% quality, Thumbnail 80% quality
```

Update naming convention:
```markdown
- **Naming convention**: `{uuid}_display.webp`, `{uuid}_thumb.webp`
```

Remove all references to the `full` / 2048px size.

Update the `IMAGE_SIZES` constant:
```typescript
const IMAGE_SIZES = {
  display:   { width: 1080, height: 1080, quality: 0.82 },
  thumbnail: { width: 256,  height: 256,  quality: 0.80 },
} as const;
```

Update "Usage in components":
```markdown
- `ProductCard` / `ShopProductGrid` → use thumbnail (256px)
- `ProductGallery` / `ProductDetail` → use display (1080px)
- `ImageLightbox` / zoom view → use display (1080px)
```

Update storage paths:
```markdown
- **Storage paths**: `photo-group-media/{photo_group_id}/{uuid}_{size}.webp`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md image standards to 2-size pipeline (remove 2048)"
```

---

## Task 16: Verification

- [ ] **Step 1: Full TypeScript compile check**

Run: `npx tsc --noEmit --pretty`
Expected: Zero errors.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify no remaining references to old processors**

Run:
```bash
grep -r "image-processor\|video-processor\|media-uploader\|_full\.webp\|2048" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (only the CLAUDE.md or spec doc may mention these as historical context).

- [ ] **Step 4: Commit any final fixes if needed**

If any issues found in steps 1-3, fix and commit.

- [ ] **Step 5: Final commit — version bump**

```bash
# Bump package.json version
git add package.json
git commit -m "chore: bump version for unified media pipeline"
```
