// Camera background effects for the recorder (R1). Two removal methods feed the same compositing:
//   • greenscreen — pure chroma-key canvas math, no ML (Phase 1).
//   • blur / virtual — MediaPipe selfie-segmentation (Phase 2) removes the real background on ANY
//     backdrop; the model + WASM are self-hosted in Supabase Storage (no third-party CDN at record
//     time). Segmentation is lazy-loaded, tracks its own throughput, and auto-downgrades to no-effect
//     if the device can't keep up (mixed hardware). The processor turns each raw camera frame into a
//     composited frame that the compositor draws exactly like a raw camera.
import { FilesetResolver, ImageSegmenter, type MPMask } from '@mediapipe/tasks-vision'

export type CameraEffectMode = 'none' | 'greenscreen' | 'blur' | 'virtual'

/** Segmentation modes need the ML model; greenscreen does not. */
export function usesSegmentation(mode: CameraEffectMode): boolean {
  return mode === 'blur' || mode === 'virtual'
}

export interface CameraBackground {
  /** Solid color fill, or a cover-fitted image behind the subject. */
  type: 'color' | 'image'
  color: string
  image: HTMLImageElement | null
}

export interface CameraEffectSettings {
  mode: CameraEffectMode
  /** Key color to remove (greenscreen only; default chroma-green). */
  keyColor: string
  /** 0–1: how close a pixel must be to the key color before it starts going transparent. */
  similarity: number
  /** 0–1: soft-edge width above the similarity threshold. */
  smoothness: number
  /** Background blur radius in px (blur mode). */
  blurAmount: number
  /** Replacement background for greenscreen + virtual modes. */
  background: CameraBackground
}

export const DEFAULT_KEY_COLOR = '#00b140' // standard chroma-key green
export const DEFAULT_EFFECT_SETTINGS: CameraEffectSettings = {
  mode: 'none',
  keyColor: DEFAULT_KEY_COLOR,
  similarity: 0.4,
  smoothness: 0.1,
  blurAmount: 14,
  background: { type: 'color', color: '#101828', image: null },
}

// Self-hosted MediaPipe assets (see migration 20260709010000_ml_models_bucket.sql). Resolved lazily
// (inside the loader) so this module imports cleanly under the node test runner, where import.meta.env
// is absent — the pure keying helpers below stay unit-testable without a Vite/browser environment.
function assetUrls(): { wasmBase: string; modelUrl: string } {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ml-models/mediapipe`
  return { wasmBase: `${base}/wasm`, modelUrl: `${base}/selfie_segmenter.tflite` }
}

export type SegmenterStatus = 'idle' | 'loading' | 'ready' | 'error'

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  const int = parseInt(n, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/** BT.601 chroma components (Cb, Cr) — chroma-keying works in the color plane, ignoring luma. */
export function rgbToCbCr(r: number, g: number, b: number): [number, number] {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return [cb, cr]
}

/**
 * Per-pixel key alpha (0 = fully removed/background, 1 = fully kept/subject). A pixel's distance
 * from the key color in the Cb/Cr plane is compared against a similarity threshold with a smooth
 * ramp: within `similarity` → removed, beyond `similarity + smoothness` → kept, linear between.
 * Pure + deterministic → unit-testable without a canvas. Distances normalized so thresholds are 0–1.
 */
export function chromaKeyAlpha(
  cb: number, cr: number, keyCb: number, keyCr: number, similarity: number, smoothness: number,
): number {
  // Max Cb/Cr distance is ~180; normalize to ~0–1.
  const dist = Math.sqrt((cb - keyCb) ** 2 + (cr - keyCr) ** 2) / 180
  const lo = similarity
  const hi = similarity + Math.max(0.0001, smoothness)
  if (dist <= lo) return 0
  if (dist >= hi) return 1
  return (dist - lo) / (hi - lo)
}

/**
 * Stateful per-recorder processor. Owns reusable canvases (no per-frame allocation) for both the
 * greenscreen (chroma-key) and segmentation (blur / virtual-bg) pipelines. `process()` returns a
 * drawable the compositor treats like the camera: the raw <video> when the effect is off or the
 * segmenter is still loading / has auto-downgraded, otherwise the composited canvas.
 */
export class CameraEffectProcessor {
  private work: HTMLCanvasElement // greenscreen: keyed subject
  private out: HTMLCanvasElement // final composited frame
  private fg: HTMLCanvasElement // segmentation: masked subject
  private mask: HTMLCanvasElement // segmentation: person mask (model resolution)
  private workCtx: CanvasRenderingContext2D
  private outCtx: CanvasRenderingContext2D
  private fgCtx: CanvasRenderingContext2D
  private maskCtx: CanvasRenderingContext2D
  private maskImage: ImageData | null = null

  // Segmentation model (lazy).
  private segmenter: ImageSegmenter | null = null
  private _status: SegmenterStatus = 'idle'
  private lastTs = 0

  // Throughput tracking → FPS meter + auto-downgrade.
  private emaMs = 0
  private warmup = 0
  private _degraded = false
  private static readonly DOWNGRADE_MS = 40 // effect ≥40ms/frame ⇒ can't sustain ~30fps → give up
  private static readonly WARMUP_FRAMES = 20

  constructor() {
    this.work = document.createElement('canvas')
    this.out = document.createElement('canvas')
    this.fg = document.createElement('canvas')
    this.mask = document.createElement('canvas')
    this.workCtx = this.work.getContext('2d', { willReadFrequently: true })!
    this.outCtx = this.out.getContext('2d')!
    this.fgCtx = this.fg.getContext('2d')!
    this.maskCtx = this.mask.getContext('2d', { willReadFrequently: true })!
  }

  get canvas(): HTMLCanvasElement { return this.out }
  get status(): SegmenterStatus { return this._status }
  /** Smoothed effect throughput estimate (frames/sec the effect stage alone could sustain). */
  get fps(): number { return this.emaMs > 0 ? Math.min(60, Math.round(1000 / this.emaMs)) : 0 }
  /** True once the effect is sustainably too slow — the recorder should switch the effect off. */
  get degraded(): boolean { return this._degraded }

  private resize(w: number, h: number): void {
    if (this.out.width !== w || this.out.height !== h) {
      for (const c of [this.work, this.out, this.fg]) { c.width = w; c.height = h }
    }
  }

  /** Kick off the (idempotent) async model load. Tries GPU, falls back to CPU. */
  private ensureSegmenter(): void {
    if (this._status === 'loading' || this._status === 'ready' || this._status === 'error') return
    this._status = 'loading'
    ;(async () => {
      try {
        const { wasmBase, modelUrl } = assetUrls()
        const fileset = await FilesetResolver.forVisionTasks(wasmBase)
        const make = (delegate: 'GPU' | 'CPU') => ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        })
        try {
          this.segmenter = await make('GPU')
        } catch {
          this.segmenter = await make('CPU')
        }
        this._status = 'ready'
      } catch {
        this._status = 'error'
      }
    })()
  }

  process(video: HTMLVideoElement, settings: CameraEffectSettings): HTMLVideoElement | HTMLCanvasElement {
    const w = video.videoWidth
    const h = video.videoHeight
    if (settings.mode === 'none' || w === 0 || h === 0) return video
    this.resize(w, h)

    if (settings.mode === 'greenscreen') return this.processGreenscreen(video, w, h, settings)

    // Segmentation modes (blur / virtual): passthrough while loading / on error / after downgrade.
    if (this._degraded || this._status === 'error') return video
    if (this._status !== 'ready') { this.ensureSegmenter(); return video }

    const t0 = performance.now()
    // Timestamps must strictly increase across VIDEO-mode calls.
    const ts = t0 <= this.lastTs ? this.lastTs + 1 : t0
    this.lastTs = ts
    let composed = false
    this.segmenter!.segmentForVideo(video, ts, (result) => {
      const m = result.confidenceMasks?.[0]
      if (m) { this.processSegmented(video, m, w, h, settings); composed = true }
    })
    if (!composed) return video

    // Update the smoothed frame time and decide whether to auto-downgrade.
    const dt = performance.now() - t0
    this.emaMs = this.emaMs === 0 ? dt : this.emaMs * 0.8 + dt * 0.2
    if (this.warmup < CameraEffectProcessor.WARMUP_FRAMES) this.warmup++
    else if (this.emaMs > CameraEffectProcessor.DOWNGRADE_MS) this._degraded = true
    return this.out
  }

  private processGreenscreen(
    video: HTMLVideoElement, w: number, h: number, settings: CameraEffectSettings,
  ): HTMLCanvasElement {
    // Draw the raw frame, then punch out the key color → transparent subject on a clear canvas.
    this.workCtx.clearRect(0, 0, w, h)
    this.workCtx.drawImage(video, 0, 0, w, h)
    const frame = this.workCtx.getImageData(0, 0, w, h)
    const d = frame.data
    const [kr, kg, kb] = hexToRgb(settings.keyColor)
    const [keyCb, keyCr] = rgbToCbCr(kr, kg, kb)
    for (let i = 0; i < d.length; i += 4) {
      const [cb, cr] = rgbToCbCr(d[i], d[i + 1], d[i + 2])
      const a = chromaKeyAlpha(cb, cr, keyCb, keyCr, settings.similarity, settings.smoothness)
      d[i + 3] = Math.round(d[i + 3] * a)
    }
    this.workCtx.putImageData(frame, 0, 0)
    this.paintBackground(this.outCtx, settings, w, h)
    this.outCtx.drawImage(this.work, 0, 0)
    return this.out
  }

  private processSegmented(
    video: HTMLVideoElement, mask: MPMask, w: number, h: number, settings: CameraEffectSettings,
  ): void {
    // 1. Person mask → an alpha canvas at model resolution.
    const mw = mask.width, mh = mask.height
    const conf = mask.getAsFloat32Array()
    if (this.mask.width !== mw || this.mask.height !== mh || !this.maskImage) {
      this.mask.width = mw; this.mask.height = mh
      this.maskImage = this.maskCtx.createImageData(mw, mh)
    }
    const md = this.maskImage.data
    for (let i = 0, p = 3; i < conf.length; i++, p += 4) md[p] = conf[i] * 255 // alpha only; RGB stays 0
    this.maskCtx.putImageData(this.maskImage, 0, 0)

    // 2. Foreground = sharp camera kept only where the mask is opaque (scaled up → soft edges).
    this.fgCtx.globalCompositeOperation = 'source-over'
    this.fgCtx.clearRect(0, 0, w, h)
    this.fgCtx.drawImage(video, 0, 0, w, h)
    this.fgCtx.globalCompositeOperation = 'destination-in'
    this.fgCtx.imageSmoothingEnabled = true
    this.fgCtx.drawImage(this.mask, 0, 0, w, h)
    this.fgCtx.globalCompositeOperation = 'source-over'

    // 3. Background: blurred camera (blur) or the chosen color/image (virtual), then subject on top.
    this.outCtx.filter = 'none'
    this.outCtx.clearRect(0, 0, w, h)
    if (settings.mode === 'blur') {
      this.outCtx.filter = `blur(${Math.max(1, settings.blurAmount)}px)`
      this.outCtx.drawImage(video, 0, 0, w, h)
      this.outCtx.filter = 'none'
    } else {
      this.paintBackground(this.outCtx, settings, w, h)
    }
    this.outCtx.drawImage(this.fg, 0, 0)
  }

  private paintBackground(
    ctx: CanvasRenderingContext2D, settings: CameraEffectSettings, w: number, h: number,
  ): void {
    const bg = settings.background
    if (bg.type === 'image' && bg.image && bg.image.complete && bg.image.naturalWidth > 0) {
      drawCoverInto(ctx, bg.image, bg.image.naturalWidth, bg.image.naturalHeight, w, h)
    } else {
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
    }
  }

  /** Release the ML model + reset throughput state (call on recorder teardown). */
  dispose(): void {
    try { this.segmenter?.close() } catch { /* already closed */ }
    this.segmenter = null
    this._status = 'idle'
    this._degraded = false
    this.emaMs = 0
    this.warmup = 0
  }
}

/** Cover-fit a source into a w×h box (crop overflow), centered. */
function drawCoverInto(
  ctx: CanvasRenderingContext2D, src: CanvasImageSource, iw: number, ih: number, w: number, h: number,
): void {
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
}
