// Logo overlay drawn onto the export/preview canvas. Text wordmark by default
// (no asset dependency); pass an HTMLImageElement to draw a real mark instead.
export type LogoCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface LogoConfig {
  enabled: boolean
  corner: LogoCorner
  /** Optional pre-loaded image; when absent a "Dealz" wordmark is drawn. */
  image?: CanvasImageSource | null
  text?: string
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const MARGIN_RATIO = 0.04

export function drawLogo(ctx: Ctx2D, cfg: LogoConfig, w: number, h: number): void {
  if (!cfg.enabled) return
  const margin = Math.round(Math.min(w, h) * MARGIN_RATIO)

  if (cfg.image) {
    const img = cfg.image as HTMLImageElement
    const iw = img.width || w * 0.18
    const ih = img.height || iw
    const scale = (w * 0.18) / iw
    const dw = iw * scale
    const dh = ih * scale
    const [x, y] = cornerXY(cfg.corner, w, h, dw, dh, margin)
    ctx.drawImage(cfg.image, x, y, dw, dh)
    return
  }

  const text = cfg.text ?? 'Dealz'
  const fontPx = Math.round(Math.min(w, h) * 0.055)
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  const metrics = ctx.measureText(text)
  const padX = Math.round(fontPx * 0.5)
  const padY = Math.round(fontPx * 0.32)
  const boxW = Math.ceil(metrics.width) + padX * 2
  const boxH = fontPx + padY * 2
  const [x, y] = cornerXY(cfg.corner, w, h, boxW, boxH, margin)

  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  roundRect(ctx, x, y, boxW, boxH, Math.round(fontPx * 0.28))
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x + padX, y + padY)
  ctx.restore()
}

function cornerXY(c: LogoCorner, w: number, h: number, dw: number, dh: number, m: number): [number, number] {
  const left = m
  const top = m
  const right = w - dw - m
  const bottom = h - dh - m
  switch (c) {
    case 'tl': return [left, top]
    case 'tr': return [right, top]
    case 'bl': return [left, bottom]
    case 'br': return [right, bottom]
  }
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
