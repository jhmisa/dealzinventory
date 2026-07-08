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
 */
export interface RecorderDims {
  canvasW: number
  canvasH: number
  product: Rect
  camera: Rect
}

const SQUARE = 720

export const ORIENTATION_DIMS: Record<Orientation, RecorderDims> = {
  // 9:16 vertical (720×1280) — Reels / Shorts / TikTok / IG / FB Live vertical.
  portrait: {
    canvasW: SQUARE,
    canvasH: 1280,
    product: { x: 0, y: 0, w: SQUARE, h: SQUARE },
    camera: { x: 0, y: SQUARE, w: SQUARE, h: 1280 - SQUARE }, // 720×560
  },
  // 16:9 landscape (1280×720) — regular YouTube.
  landscape: {
    canvasW: 1280,
    canvasH: SQUARE,
    product: { x: 0, y: 0, w: SQUARE, h: SQUARE },
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
