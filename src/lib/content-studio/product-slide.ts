// Product slide rendering for the carousel builder: bake a product photo (P/B/G/A)
// into a 1080×1080 slide, optionally with a specs + price overlay, plus a multi-
// product "lineup cover" grid. Pure geometry/text here is unit-tested; canvas
// drawing mirrors review-card.ts.

export const PRODUCT_SLIDE_SIZE = 1080

export type SlideOverlay = 'none' | 'specs'

export interface ProductSlideInfo {
  code: string
  description: string
  price: number | null
  originalPrice?: number
  grade: string | null
}

/** Source rect that center-crops an imgW×imgH image to cover a cellW×cellH box. */
export function coverCrop(imgW: number, imgH: number, cellW: number, cellH: number): { sx: number; sy: number; sw: number; sh: number } {
  const cellAspect = cellW / cellH
  const imgAspect = imgW / imgH
  if (imgAspect > cellAspect) {
    const sw = imgH * cellAspect
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH }
  }
  const sh = imgW / cellAspect
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh }
}

export function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString('en-US')}`
}

/** Uniform grid cells (row-major, last row centered) for up to 9 images on a size×size canvas. */
export function gridLayout(n: number, size: number, gutter = 8): { x: number; y: number; w: number; h: number }[] {
  const count = Math.min(Math.max(n, 1), 9)
  if (count === 1) return [{ x: 0, y: 0, w: size, h: size }]
  const cols = count <= 4 ? 2 : 3
  const rows = Math.ceil(count / cols)
  const cw = (size - gutter * (cols - 1)) / cols
  const ch = (size - gutter * (rows - 1)) / rows
  const cells: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const inRow = row === rows - 1 ? count - row * cols : cols
    const rowOffset = (size - (inRow * cw + (inRow - 1) * gutter)) / 2
    const col = i - row * cols
    cells.push({ x: rowOffset + col * (cw + gutter), y: row * (ch + gutter), w: cw, h: ch })
  }
  return cells
}

/** Map a ShowcaseItem-shaped record to overlay info (effective price, struck original). */
export function slideInfoFromShowcase(s: {
  item_code: string
  description: string
  selling_price: number | null
  discount: number | null
  condition_grade: string | null
}): ProductSlideInfo {
  const discount = Number(s.discount ?? 0)
  const price = s.selling_price != null ? Math.max(0, s.selling_price - discount) : null
  return {
    code: s.item_code,
    description: s.description,
    price,
    originalPrice: s.selling_price != null && discount > 0 ? s.selling_price : undefined,
    grade: s.condition_grade,
  }
}
