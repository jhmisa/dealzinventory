import type { MediaMode, RecorderCard, Rect } from './types'
import { drawShowcaseInfo, roundRect } from './overlay'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface CompositeInput {
  ctx: Ctx2D
  canvasW: number
  canvasH: number
  /** The protected product-showcase square. */
  product: Rect
  /** The info band straddling the product↔camera seam (code · rank · price · specs). */
  specs: Rect
  /** The remaining box the seller's camera fills. */
  cameraBox: Rect
  card: RecorderCard
  mode: MediaMode
  photoIndex: number
  videoIndex: number
  /** The seller camera — a raw <video>, or a pre-processed effect <canvas> (chroma-key / blur). */
  camera: HTMLVideoElement | HTMLCanvasElement | null
  /** Talking-head preset: draw the camera BEHIND the product chip + specs (default false). */
  cameraBehind?: boolean
}

/**
 * Compose one frame: a protected product-showcase square (rotating photos or a
 * playing video, with the info block over it) plus the live seller's camera in
 * whatever space is left — stacked for vertical (9:16), side-by-side for
 * landscape (16:9). The product square is always the same size in both.
 */
export function compositeFrame({
  ctx, canvasW, canvasH, product, specs, cameraBox, card, mode, photoIndex, videoIndex, camera, cameraBehind = false,
}: CompositeInput): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Talking-head: camera is the backdrop, drawn first; product chip + specs land on top.
  if (cameraBehind) drawCamera(ctx, cameraBox, camera)

  // ---- Product showcase square ----
  const { x, y, w, h } = product
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x, y, w, h)

  if (mode === 'photos' && card.photos.length) {
    const img = card.photos[photoIndex % card.photos.length]
    if (img && img.complete && img.naturalWidth > 0) {
      drawContain(ctx, img, img.naturalWidth, img.naturalHeight, x, y, w, h)
    }
  } else if (mode === 'videos' && card.videos.length) {
    const v = card.videos[videoIndex % card.videos.length]
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      drawContain(ctx, v, v.videoWidth, v.videoHeight, x, y, w, h)
    }
  }

  // mode pill (top-left) + media counter (top-right), sized off the square
  const count = mode === 'photos' ? card.photos.length : card.videos.length
  const idx = (mode === 'photos' ? photoIndex : videoIndex) % Math.max(1, count)
  const margin = Math.round(w * 0.03)
  drawPill(ctx, mode === 'photos' ? 'PHOTOS' : 'VIDEO', x + margin, y + margin, w)
  if (count > 1) drawCounter(ctx, `${idx + 1} / ${count}`, x + w - margin, y + margin, w)

  // ---- Specs band (straddles the seam: overlaps the product bottom + reclaimed strip) ----
  drawShowcaseInfo(ctx, card, specs)

  // ---- Live camera box (default order: camera fills its own box, on top) ----
  if (!cameraBehind) {
    drawCamera(ctx, cameraBox, camera)

    // seam divider along the shared edge (only meaningful when camera has its own box)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = Math.max(1, w * 0.003)
    ctx.beginPath()
    if (cameraBox.x > product.x) {
      // side-by-side (landscape): vertical seam
      ctx.moveTo(cameraBox.x, 0)
      ctx.lineTo(cameraBox.x, canvasH)
    } else {
      // stacked (portrait): horizontal seam
      ctx.moveTo(0, cameraBox.y)
      ctx.lineTo(canvasW, cameraBox.y)
    }
    ctx.stroke()
  }
}

/** Fill a camera box (raw <video> or a pre-processed effect <canvas>), cover-fit. */
function drawCamera(ctx: Ctx2D, box: Rect, camera: HTMLVideoElement | HTMLCanvasElement | null): void {
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(box.x, box.y, box.w, box.h)
  if (!camera) return
  const isVideo = 'videoWidth' in camera
  const cw = isVideo ? camera.videoWidth : camera.width
  const ch = isVideo ? camera.videoHeight : camera.height
  const ready = isVideo ? camera.readyState >= 2 : true
  if (ready && cw > 0) {
    drawCover(ctx, camera, cw, ch, box.x, box.y, box.w, box.h)
  }
}

/** Fit an image/video inside a box, letterboxed (whole media visible). */
function drawContain(
  ctx: Ctx2D, src: CanvasImageSource, iw: number, ih: number, bx: number, by: number, bw: number, bh: number,
): void {
  const scale = Math.min(bw / iw, bh / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(src, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
}

/** Fill a box with an image/video, cropping the overflow (used for the camera). */
function drawCover(
  ctx: Ctx2D, src: CanvasImageSource, iw: number, ih: number, bx: number, by: number, bw: number, bh: number,
): void {
  const scale = Math.max(bw / iw, bh / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(bx, by, bw, bh)
  ctx.clip()
  ctx.drawImage(src, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
  ctx.restore()
}

function drawPill(ctx: Ctx2D, text: string, x: number, y: number, w: number): void {
  const px = Math.round(w * 0.026)
  ctx.font = `700 ${px}px Inter, system-ui, sans-serif`
  const bw = ctx.measureText(text).width + px * 1.4
  const bh = px * 1.9
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, x, y, bw, bh, bh / 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + px * 0.7, y + bh / 2 + px * 0.05)
  ctx.textBaseline = 'alphabetic'
}

function drawCounter(ctx: Ctx2D, text: string, rightX: number, y: number, w: number): void {
  const px = Math.round(w * 0.028)
  ctx.font = `600 ${px}px ui-monospace, monospace`
  const bw = ctx.measureText(text).width + px * 1.4
  const bh = px * 1.9
  const x = rightX - bw
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, x, y, bw, bh, bh / 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + px * 0.7, y + bh / 2 + px * 0.05)
  ctx.textBaseline = 'alphabetic'
}
