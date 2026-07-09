import type { RecorderCard, Rect } from './types'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** SPACE-press timestamps → sorted, de-duped, in-range (0,duration) item boundaries. */
export function computeItemBounds(spaceTimestamps: number[], duration: number): number[] {
  return [...new Set(spaceTimestamps.filter((t) => t > 0 && t < duration))].sort((a, b) => a - b)
}

export function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function yen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('en-US')
}

/** Truncate a single line to fit `maxW`, appending an ellipsis. */
function fitLine(ctx: Ctx2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** Wrap `text` to at most `maxLines` lines within `maxW` (last line ellipsized). */
function wrapLines(ctx: Ctx2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines - 1) break
    } else {
      line = next
    }
  }
  const rest = words.slice(lines.reduce((n, l) => n + l.split(' ').length, 0)).join(' ') || line
  if (lines.length < maxLines) lines.push(fitLine(ctx, rest, maxW))
  return lines.slice(0, maxLines)
}

/**
 * Product info band (R2). Drawn into the `specs` Rect that STRADDLES the product↔camera
 * seam: its top overlaps the product's bottom over a top→bottom black gradient, and (portrait)
 * it extends down into a strip reclaimed off the camera's top. Layout, bottom-up:
 *   • a compact meta row — code · Rank chip · price (smaller than before, all on one line)
 *   • above it, the spec-rich description — lighter (500) + slightly smaller so MORE text fits,
 *     full-width and left-aligned, wrapping to as many lines as the band allows
 *   • an optional dim condition-notes line above that, only if a line is spare
 * `w` (band width) drives every font size, so both orientations scale identically.
 */
export function drawShowcaseInfo(ctx: Ctx2D, card: RecorderCard, band: Rect): void {
  const { x, y, w, h } = band
  const pad = Math.round(w * 0.04)

  // Top→bottom black gradient across the whole band: transparent where it starts on the product,
  // solid in the reclaimed strip — one continuous scrim across the seam.
  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.4, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1, 'rgba(0,0,0,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const bottom = y + h - pad

  // ---- Meta row (bottom): code · Rank chip · price, all bottom-aligned on one line ----
  const codePx = Math.round(w * 0.05)
  const pricePx = Math.round(w * 0.056) // was ~0.094 — smaller, aligned to the code+rank row
  const rowH = Math.max(codePx, pricePx)
  let mx = x + pad

  ctx.font = `700 ${codePx}px ui-monospace, monospace`
  ctx.fillStyle = '#fff'
  ctx.fillText(card.code, mx, bottom)
  mx += ctx.measureText(card.code).width + pad * 0.55

  if (card.grade) {
    const gPx = Math.round(w * 0.036)
    ctx.font = `700 ${gPx}px Inter, system-ui, sans-serif`
    const label = `Rank ${card.grade}`
    const gw = ctx.measureText(label).width + gPx * 0.8
    const chipH = gPx * 1.5
    const gy = bottom - chipH + gPx * 0.16 // sit the chip on the baseline row
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    roundRect(ctx, mx, gy, gw, chipH, gPx * 0.35)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, mx + gPx * 0.4, gy + gPx * 1.05)
    mx += gw + pad * 0.6
  }

  ctx.font = `800 ${pricePx}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  const priceStr = yen(card.price)
  ctx.fillText(priceStr, mx, bottom)
  mx += ctx.measureText(priceStr).width

  if (card.originalPrice && card.originalPrice > card.price) {
    const oPx = Math.round(w * 0.032)
    ctx.font = `500 ${oPx}px Inter, system-ui, sans-serif`
    const oStr = yen(card.originalPrice)
    const ox = mx + pad * 0.4
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(oStr, ox, bottom)
    const oW = ctx.measureText(oStr).width
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = Math.max(1, oPx * 0.06)
    ctx.beginPath()
    ctx.moveTo(ox, bottom - oPx * 0.32)
    ctx.lineTo(ox + oW, bottom - oPx * 0.32)
    ctx.stroke()
  }

  // ---- Description (above the meta row), lighter + smaller, wrapping to fill the band ----
  const maxW = w - pad * 2
  const topLimit = y + pad
  let descBottom = bottom - rowH * 1.2

  const dPx = Math.round(w * 0.04)
  const dLineH = dPx * 1.22
  // How many description lines physically fit between the band top and the meta row.
  let capacity = Math.max(1, Math.floor((descBottom - topLimit) / dLineH))

  // Reserve one line for condition notes if present and there's room to spare.
  const showNotes = !!card.conditionNotes && capacity > 2
  if (showNotes) capacity -= 1

  if (card.subtitle) {
    ctx.font = `500 ${dPx}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    const descLines = wrapLines(ctx, card.subtitle, maxW, Math.min(capacity, 4))
    for (let i = descLines.length - 1; i >= 0; i--) {
      ctx.fillText(descLines[i], x + pad, descBottom)
      descBottom -= dLineH
    }
  }

  if (showNotes && card.conditionNotes) {
    const nPx = Math.round(w * 0.03)
    ctx.font = `500 ${nPx}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fillText(fitLine(ctx, card.conditionNotes, maxW), x + pad, descBottom)
  }
}
