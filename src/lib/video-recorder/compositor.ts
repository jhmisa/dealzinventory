import type { RecorderCard, RecorderLayout } from './types'
import { drawOverlayCard, roundRect } from './overlay'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface CompositeInput {
  ctx: Ctx2D
  w: number
  h: number
  card: RecorderCard
  camera: HTMLVideoElement | null
  layout: RecorderLayout
}

/** Draw one composited frame: hero full-bleed (cover) → camera PiP → overlay card. */
export function compositeFrame({ ctx, w, h, card, camera, layout }: CompositeInput): void {
  // Background: hero image (cover) or solid.
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, w, h)
  if (card.hero && card.hero.complete && card.hero.naturalWidth > 0) {
    drawCover(ctx, card.hero, card.hero.naturalWidth, card.hero.naturalHeight, w, h)
  }

  // Camera PiP.
  if (camera && camera.readyState >= 2 && camera.videoWidth > 0) {
    const pipW = Math.round(w * layout.pipScale)
    const pipH = Math.round(pipW * (camera.videoHeight / camera.videoWidth))
    const m = Math.round(w * 0.03)
    const x = layout.pipCorner.includes('r') ? w - pipW - m : m
    const y = layout.pipCorner.includes('b') ? h - pipH - m * 4 : m
    ctx.save()
    roundRect(ctx, x, y, pipW, pipH, pipW * 0.06)
    ctx.clip()
    ctx.drawImage(camera, x, y, pipW, pipH)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = Math.max(2, w * 0.004)
    roundRect(ctx, x, y, pipW, pipH, pipW * 0.06)
    ctx.stroke()
  }

  drawOverlayCard(ctx, card, w, h)
}

function drawCover(ctx: Ctx2D, img: CanvasImageSource, iw: number, ih: number, w: number, h: number): void {
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}
