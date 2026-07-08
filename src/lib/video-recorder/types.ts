export interface RecorderCard {
  code: string
  title: string
  subtitle?: string | null
  grade?: string | null
  price: number
  originalPrice?: number | null
  conditionNotes?: string | null
  /** Pre-loaded, CORS-clean hero image (or null → solid background). */
  hero?: HTMLImageElement | null
}

export type PipCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface RecorderLayout {
  pipCorner: PipCorner
  /** PiP width as a fraction of canvas width (e.g. 0.3). */
  pipScale: number
}
