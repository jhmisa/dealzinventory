// Camera background effects for the recorder (R1). Phase 1 = greenscreen chroma-key (pure canvas
// math, no ML). Phase 2 (follow-up) adds MediaPipe selfie-segmentation for Blur / Virtual background
// on ANY backdrop, loaded from a self-hosted model. The processor turns each raw camera frame into a
// composited frame (background + keyed subject) that the compositor draws exactly like a raw camera.

export type CameraEffectMode = 'none' | 'greenscreen'

export interface CameraBackground {
  /** Solid color fill, or a cover-fitted image behind the keyed subject. */
  type: 'color' | 'image'
  color: string
  image: HTMLImageElement | null
}

export interface CameraEffectSettings {
  mode: CameraEffectMode
  /** Key color to remove (default chroma-green). */
  keyColor: string
  /** 0–1: how close a pixel must be to the key color before it starts going transparent. */
  similarity: number
  /** 0–1: soft-edge width above the similarity threshold. */
  smoothness: number
  background: CameraBackground
}

export const DEFAULT_KEY_COLOR = '#00b140' // standard chroma-key green
export const DEFAULT_EFFECT_SETTINGS: CameraEffectSettings = {
  mode: 'none',
  keyColor: DEFAULT_KEY_COLOR,
  similarity: 0.4,
  smoothness: 0.1,
  background: { type: 'color', color: '#101828', image: null },
}

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
 * Stateful per-recorder processor. Owns two reusable canvases (work = keyed subject, out = final
 * frame) so the RAF loop allocates nothing per frame. `process()` returns a drawable the compositor
 * treats like the camera: the raw <video> when the effect is off, otherwise the composited canvas.
 */
export class CameraEffectProcessor {
  private work: HTMLCanvasElement
  private out: HTMLCanvasElement
  private workCtx: CanvasRenderingContext2D
  private outCtx: CanvasRenderingContext2D

  constructor() {
    this.work = document.createElement('canvas')
    this.out = document.createElement('canvas')
    this.workCtx = this.work.getContext('2d', { willReadFrequently: true })!
    this.outCtx = this.out.getContext('2d')!
  }

  /** The composited canvas from the last process() — has width/height for the compositor. */
  get canvas(): HTMLCanvasElement {
    return this.out
  }

  process(video: HTMLVideoElement, settings: CameraEffectSettings): HTMLVideoElement | HTMLCanvasElement {
    const w = video.videoWidth
    const h = video.videoHeight
    if (settings.mode === 'none' || w === 0 || h === 0) return video

    if (this.work.width !== w || this.work.height !== h) {
      this.work.width = w; this.work.height = h
      this.out.width = w; this.out.height = h
    }

    // 1. Draw the raw frame, then punch out the key color → transparent subject on a clear canvas.
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

    // 2. Paint the chosen background, then the keyed subject over it.
    const bg = settings.background
    if (bg.type === 'image' && bg.image && bg.image.complete && bg.image.naturalWidth > 0) {
      drawCoverInto(this.outCtx, bg.image, bg.image.naturalWidth, bg.image.naturalHeight, w, h)
    } else {
      this.outCtx.fillStyle = bg.color
      this.outCtx.fillRect(0, 0, w, h)
    }
    this.outCtx.drawImage(this.work, 0, 0)
    return this.out
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
