import type { RecorderCard } from './types'

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
 * Product info block, drawn straddling the lower portion of the media square
 * (mirrors the customer-facing showcase page): code · rank · price on the left,
 * title · spec line on the right, over a bottom-fading scrim.
 */
export function drawShowcaseInfo(ctx: Ctx2D, card: RecorderCard, x: number, y: number, w: number, h: number): void {
  const pad = Math.round(w * 0.042)
  const bandTop = y + Math.round(h * 0.56)

  // Bottom-fading scrim for legibility over any photo.
  const grad = ctx.createLinearGradient(0, bandTop, 0, y + h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(x, bandTop, w, y + h - bandTop)

  ctx.textBaseline = 'alphabetic'
  const bottom = y + h - pad

  // ---- LEFT column (bottom-up): price, strike original, code + rank ----
  const pricePx = Math.round(w * 0.094)
  ctx.font = `800 ${pricePx}px Inter, system-ui, sans-serif`
  const priceStr = yen(card.price)
  const priceW = ctx.measureText(priceStr).width
  ctx.fillStyle = '#fff'
  ctx.fillText(priceStr, pad, bottom)

  let ly = bottom - pricePx * 1.02

  if (card.originalPrice && card.originalPrice > card.price) {
    const oPx = Math.round(w * 0.04)
    ctx.font = `500 ${oPx}px Inter, system-ui, sans-serif`
    const oStr = yen(card.originalPrice)
    const oW = ctx.measureText(oStr).width
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(oStr, pad, ly)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = Math.max(1, oPx * 0.06)
    ctx.beginPath()
    ctx.moveTo(pad, ly - oPx * 0.3)
    ctx.lineTo(pad + oW, ly - oPx * 0.3)
    ctx.stroke()
    ly -= oPx * 1.4
  }

  // code + rank chip on one line
  const codePx = Math.round(w * 0.05)
  ctx.font = `700 ${codePx}px ui-monospace, monospace`
  ctx.fillStyle = '#fff'
  ctx.fillText(card.code, pad, ly)
  const codeW = ctx.measureText(card.code).width
  let leftColW = Math.max(priceW, codeW)

  if (card.grade) {
    const gPx = Math.round(w * 0.036)
    ctx.font = `700 ${gPx}px Inter, system-ui, sans-serif`
    const label = `Rank ${card.grade}`
    const gw = ctx.measureText(label).width + gPx * 0.8
    const gx = pad + codeW + pad * 0.4
    const gy = ly - codePx * 0.82
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    roundRect(ctx, gx, gy, gw, gPx * 1.5, gPx * 0.35)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, gx + gPx * 0.4, gy + gPx * 1.05)
    leftColW = Math.max(leftColW, codeW + pad * 0.4 + gw)
  }

  // ---- RIGHT column (bottom-up): condition notes, then the spec-rich description ----
  // Mirrors the customer showcase page: the description (storage/RAM/chip/color) is the
  // primary text — NOT the brand+model title, which duplicated the code column above.
  const rightX = Math.max(x + w * 0.46, x + pad + leftColW + w * 0.03)
  const rightW = x + w - pad - rightX
  if (rightW > w * 0.2) {
    ctx.textAlign = 'right'
    let ry = bottom

    // Condition notes: a "CONDITION" label + up to 2 lines (showcase's Condition block).
    if (card.conditionNotes) {
      const nPx = Math.round(w * 0.019)
      ctx.font = `500 ${nPx}px Inter, system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      const noteLines = wrapLines(ctx, card.conditionNotes, rightW, 2)
      for (let i = noteLines.length - 1; i >= 0; i--) {
        ctx.fillText(noteLines[i], x + w - pad, ry)
        ry -= nPx * 1.35
      }
      const lPx = Math.round(w * 0.015)
      ctx.font = `700 ${lPx}px Inter, system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText('CONDITION', x + w - pad, ry)
      ry -= lPx * 2.2
    }

    // Spec-rich description — same string the showcase page shows (line-clamp-3).
    if (card.subtitle) {
      const dPx = Math.round(w * 0.042)
      ctx.font = `600 ${dPx}px Inter, system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.96)'
      const descLines = wrapLines(ctx, card.subtitle, rightW, 3)
      for (let i = descLines.length - 1; i >= 0; i--) {
        ctx.fillText(descLines[i], x + w - pad, ry)
        ry -= dPx * 1.2
      }
    }
    ctx.textAlign = 'left'
  }
}
