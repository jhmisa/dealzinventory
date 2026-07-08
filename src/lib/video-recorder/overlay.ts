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

/** Data-driven product card, drawn as a lower-third band. */
export function drawOverlayCard(ctx: Ctx2D, card: RecorderCard, w: number, h: number): void {
  const pad = Math.round(w * 0.045)
  const bandH = Math.round(h * 0.22)
  const y = h - bandH

  // scrim gradient for legibility
  const grad = ctx.createLinearGradient(0, y - bandH * 0.4, 0, h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = grad
  ctx.fillRect(0, y - bandH * 0.4, w, bandH * 1.4)

  // title
  const titlePx = Math.round(w * 0.052)
  ctx.font = `700 ${titlePx}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.fillText(card.title, pad, y + pad, w - pad * 2)

  // code chip (top-right of band)
  const chipPx = Math.round(w * 0.032)
  ctx.font = `600 ${chipPx}px ui-monospace, monospace`
  const chipW = ctx.measureText(card.code).width + chipPx
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  roundRect(ctx, w - pad - chipW, y + pad, chipW, chipPx * 1.7, chipPx * 0.4)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(card.code, w - pad - chipW + chipPx * 0.5, y + pad + chipPx * 0.35)

  // price row
  const priceY = y + pad + titlePx * 1.5
  const pricePx = Math.round(w * 0.06)
  ctx.font = `800 ${pricePx}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  ctx.fillText(yen(card.price), pad, priceY)
  const priceW = ctx.measureText(yen(card.price)).width

  if (card.originalPrice && card.originalPrice > card.price) {
    const oPx = Math.round(w * 0.036)
    ctx.font = `500 ${oPx}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    const ox = pad + priceW + pricePx * 0.4
    const ow = ctx.measureText(yen(card.originalPrice)).width
    ctx.fillText(yen(card.originalPrice), ox, priceY + pricePx * 0.35)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = Math.max(1, oPx * 0.06)
    ctx.beginPath()
    ctx.moveTo(ox, priceY + pricePx * 0.35 + oPx * 0.55)
    ctx.lineTo(ox + ow, priceY + pricePx * 0.35 + oPx * 0.55)
    ctx.stroke()
  }

  // grade chip (bottom-right)
  if (card.grade) {
    const gPx = Math.round(w * 0.034)
    ctx.font = `700 ${gPx}px Inter, system-ui, sans-serif`
    const label = `Grade ${card.grade}`
    const gw = ctx.measureText(label).width + gPx
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    roundRect(ctx, w - pad - gw, priceY + pricePx * 0.1, gw, gPx * 1.7, gPx * 0.4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, w - pad - gw + gPx * 0.5, priceY + pricePx * 0.1 + gPx * 0.35)
  }
}
