import { ORIENTATION_DIMS, type LayoutPreset, type Orientation, type Rect } from './types'

export interface LayoutRegions {
  product: Rect
  specs: Rect
  cameraBox: Rect
  /** Draw the camera BEHIND the product/specs (talking-head) vs. in its own box. */
  cameraBehind: boolean
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/**
 * Region rects for a given orientation + preset. product-showcase reuses the protected
 * showcase geometry; talking-head puts the camera full-frame with a product chip on top;
 * specs-inset gives the info band more room with a smaller camera. All rects stay in-canvas.
 */
export function regionsFor(orientation: Orientation, preset: LayoutPreset): LayoutRegions {
  const dims = ORIENTATION_DIMS[orientation]
  const W = dims.canvasW
  const H = dims.canvasH

  if (preset === 'product-showcase') {
    return { product: dims.product, specs: dims.specs, cameraBox: dims.camera, cameraBehind: false }
  }

  if (preset === 'talking-head') {
    const bandH = Math.round(H * 0.16)
    const chip = Math.round(W * 0.3)
    const margin = Math.round(W * 0.05)
    return {
      cameraBox: r(0, 0, W, H),
      specs: r(0, H - bandH, W, bandH),
      product: r(margin, H - bandH - chip - Math.round(H * 0.015), chip, chip),
      cameraBehind: true,
    }
  }

  // specs-inset
  if (orientation === 'portrait') {
    const prodH = Math.round(H * 0.44) // ~563
    const camY = Math.round(H * 0.66) // ~845
    return {
      product: r(0, 0, W, prodH),
      specs: r(0, Math.round(H * 0.36), W, Math.round(H * 0.3)),
      cameraBox: r(0, camY, W, H - camY),
      cameraBehind: false,
    }
  }
  const prodW = Math.round(W * 0.62) // ~794
  return {
    product: r(0, 0, prodW, H),
    specs: r(0, Math.round(H * 0.55), prodW, Math.round(H * 0.45)),
    cameraBox: r(prodW, 0, W - prodW, H),
    cameraBehind: false,
  }
}

/**
 * Retake the CURRENT product's scene: keep the boundaries of earlier scenes, drop the current
 * scene's boundary onward, and report the rewind point (the start time of the current scene).
 * itemBounds = SPACE-tap times (scene i>=1 starts at bounds[i-1]; scene 0 starts at 0).
 */
export function retakeBounds(bounds: number[], currentIndex: number): { keepBounds: number[]; rewindToSec: number } {
  const idx = Math.max(0, currentIndex)
  return {
    keepBounds: bounds.slice(0, idx),
    rewindToSec: idx >= 1 ? bounds[idx - 1] ?? 0 : 0,
  }
}
