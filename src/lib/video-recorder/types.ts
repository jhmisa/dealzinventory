export type MediaMode = 'photos' | 'videos'

export type Orientation = 'portrait' | 'landscape'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Canvas + region layout for an orientation. The product-showcase square is
 * always 720×720 (protected); the seller's camera fills whatever is left —
 * stacked below for vertical (9:16), beside it for landscape (16:9).
 *
 * `specs` is the dedicated info band (code · rank · price · spec description). It
 * STRADDLES the product↔camera seam (R2): its top overlaps the product's bottom
 * (over a top→bottom gradient), and — for portrait — it extends DOWN into a strip
 * reclaimed off the camera's top, so specs get more room while covering less of the
 * product. Landscape has no vertical room to reclaim, so its band stays an overlay
 * on the product's lower portion and the camera is unchanged.
 */
export interface RecorderDims {
  canvasW: number
  canvasH: number
  product: Rect
  specs: Rect
  camera: Rect
}

const SQUARE = 720

// --- R2 tunables (dial in against a real recording with Joey) ---
// Portrait: how far the specs band reaches UP into the product's bottom (overlap) and how tall a
// strip it reclaims DOWN off the camera's top. Product overlap ≈ 150 is ~half of the old ~317.
const PORTRAIT_OVERLAP = 150
const PORTRAIT_STRIP = 200
// Landscape: overlay height on the product's lower portion (no strip to reclaim beside the camera).
const LANDSCAPE_OVERLAP = 320

export const ORIENTATION_DIMS: Record<Orientation, RecorderDims> = {
  // 9:16 vertical (720×1280) — Reels / Shorts / TikTok / IG / FB Live vertical.
  portrait: {
    canvasW: SQUARE,
    canvasH: 1280,
    product: { x: 0, y: 0, w: SQUARE, h: SQUARE },
    // Overlaps the product's bottom PORTRAIT_OVERLAP px, then continues PORTRAIT_STRIP px below it.
    specs: { x: 0, y: SQUARE - PORTRAIT_OVERLAP, w: SQUARE, h: PORTRAIT_OVERLAP + PORTRAIT_STRIP }, // {0,570,720,350}
    camera: { x: 0, y: SQUARE + PORTRAIT_STRIP, w: SQUARE, h: 1280 - SQUARE - PORTRAIT_STRIP }, // {0,920,720,360}
  },
  // 16:9 landscape (1280×720) — regular YouTube.
  landscape: {
    canvasW: 1280,
    canvasH: SQUARE,
    product: { x: 0, y: 0, w: SQUARE, h: SQUARE },
    specs: { x: 0, y: SQUARE - LANDSCAPE_OVERLAP, w: SQUARE, h: LANDSCAPE_OVERLAP }, // {0,400,720,320} — overlay only
    camera: { x: SQUARE, y: 0, w: 1280 - SQUARE, h: SQUARE }, // 560×720
  },
}

export interface RecorderCard {
  code: string
  title: string
  subtitle?: string | null
  grade?: string | null
  price: number
  originalPrice?: number | null
  conditionNotes?: string | null
  /** All product photos, preloaded CORS-clean, in display order. */
  photos: HTMLImageElement[]
  /** All product videos as detached, muted <video> elements (CORS-clean), in display order. */
  videos: HTMLVideoElement[]
}

/** Per-card playback runtime, mutated in place by the recorder's RAF loop. */
export interface CardRuntime {
  mode: MediaMode
  photoIndex: number
  videoIndex: number
  /** performance.now() when the current photo started showing (drives auto-rotation). */
  photoStart: number
}
