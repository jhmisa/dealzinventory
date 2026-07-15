// Product slide rendering for the carousel builder: bake a product photo (P/B/G/A)
// into a 1080×1080 slide, optionally with a specs + price overlay, plus a multi-
// product "lineup cover" grid. Pure geometry/text here is unit-tested; canvas
// drawing mirrors review-card.ts.

import { wrapText } from './review-card'

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

// --- Canvas rendering (browser only) ---

type Ctx2D = CanvasRenderingContext2D

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // CORS-clean draw — avoids canvas taint (same as recorder.tsx)
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Couldn't load image: ${url}`))
    img.src = url
  })
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawImageCover(ctx: Ctx2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, w, h)
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/** One product photo baked to a 1080² slide; overlay 'specs' adds grade chip + description + price band. */
export function drawProductSlide(ctx: Ctx2D, img: HTMLImageElement, info: ProductSlideInfo, overlay: SlideOverlay): void {
  const S = PRODUCT_SLIDE_SIZE
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#16140F'
  ctx.fillRect(0, 0, S, S)
  drawImageCover(ctx, img, 0, 0, S, S)
  if (overlay === 'none') return

  const pad = 56

  // Bottom gradient band.
  const bandTop = S - 380
  const grad = ctx.createLinearGradient(0, bandTop, 0, S)
  grad.addColorStop(0, 'rgba(10,9,6,0)')
  grad.addColorStop(0.45, 'rgba(10,9,6,0.72)')
  grad.addColorStop(1, 'rgba(10,9,6,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(0, bandTop, S, S - bandTop)

  // Grade chip, top-left.
  if (info.grade) {
    const label = `GRADE ${info.grade}`
    ctx.font = '700 34px Inter, system-ui, sans-serif'
    const w = ctx.measureText(label).width + 44
    ctx.fillStyle = 'rgba(22,20,15,0.85)'
    roundRect(ctx, pad, pad, w, 62, 31)
    ctx.fill()
    ctx.fillStyle = '#F3F1EC'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pad + 22, pad + 33)
    ctx.textBaseline = 'alphabetic'
  }

  // Wordmark, top-right.
  ctx.font = '800 40px Inter, system-ui, sans-serif'
  const mark = 'dealz.'
  ctx.fillStyle = 'rgba(243,241,236,0.92)'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 12
  ctx.fillText(mark, S - pad - ctx.measureText(mark).width, pad + 40)
  ctx.shadowBlur = 0

  // Description — up to 2 wrapped lines above the price row.
  ctx.fillStyle = '#F3F1EC'
  const descSize = 42
  ctx.font = `600 ${descSize}px Inter, system-ui, sans-serif`
  const lines = wrapText(info.description, 42, 2)
  let y = S - pad - 96 - (lines.length - 1) * (descSize * 1.3)
  for (const line of lines) {
    ctx.fillText(line, pad, y)
    y += descSize * 1.3
  }

  // Price row: big effective price, struck original, code right-aligned.
  const baseline = S - pad
  if (info.price != null) {
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 76px Inter, system-ui, sans-serif'
    const priceStr = formatYen(info.price)
    ctx.fillText(priceStr, pad, baseline)
    if (info.originalPrice != null) {
      const px = pad + ctx.measureText(priceStr).width + 28
      ctx.font = '600 44px Inter, system-ui, sans-serif'
      ctx.fillStyle = 'rgba(243,241,236,0.65)'
      const orig = formatYen(info.originalPrice)
      ctx.fillText(orig, px, baseline - 6)
      const ow = ctx.measureText(orig).width
      ctx.strokeStyle = 'rgba(243,241,236,0.65)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(px - 2, baseline - 20)
      ctx.lineTo(px + ow + 2, baseline - 20)
      ctx.stroke()
    }
  }
  ctx.font = '500 34px "JetBrains Mono", ui-monospace, monospace'
  ctx.fillStyle = 'rgba(243,241,236,0.7)'
  const code = info.code
  ctx.fillText(code, S - pad - ctx.measureText(code).width, baseline)
}

/** Multi-product lineup cover: grid of photos, price pill per cell, wordmark. */
export function drawLineupCover(ctx: Ctx2D, entries: { img: HTMLImageElement; info: ProductSlideInfo }[]): void {
  const S = PRODUCT_SLIDE_SIZE
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#16140F'
  ctx.fillRect(0, 0, S, S)
  const cells = gridLayout(entries.length, S, 10)
  cells.forEach((cell, i) => {
    const { img, info } = entries[i]
    drawImageCover(ctx, img, cell.x, cell.y, cell.w, cell.h)
    if (info.price != null) {
      const label = formatYen(info.price)
      ctx.font = '700 34px Inter, system-ui, sans-serif'
      const w = ctx.measureText(label).width + 36
      const px = cell.x + 16
      const py = cell.y + cell.h - 16 - 56
      ctx.fillStyle = 'rgba(22,20,15,0.85)'
      roundRect(ctx, px, py, w, 56, 28)
      ctx.fill()
      ctx.fillStyle = '#F3F1EC'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, px + 18, py + 30)
      ctx.textBaseline = 'alphabetic'
    }
  })
  ctx.font = '800 44px Inter, system-ui, sans-serif'
  const mark = 'dealz.'
  ctx.fillStyle = 'rgba(243,241,236,0.95)'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 14
  ctx.fillText(mark, S - 40 - ctx.measureText(mark).width, S - 40)
  ctx.shadowBlur = 0
}
