import assert from 'node:assert/strict'
import { chromaKeyAlpha, hexToRgb, rgbToCbCr } from './camera-effect'

// hex parsing: full + shorthand
assert.deepEqual(hexToRgb('#00b140'), [0, 177, 64])
assert.deepEqual(hexToRgb('#0f0'), [0, 255, 0])

// The key color itself sits at distance 0 → fully removed (alpha 0).
const [kCb, kCr] = rgbToCbCr(...hexToRgb('#00b140'))
assert.equal(chromaKeyAlpha(kCb, kCr, kCb, kCr, 0.4, 0.1), 0)

// A skin/red tone is far from chroma-green → fully kept (alpha 1).
const [sCb, sCr] = rgbToCbCr(220, 150, 120)
assert.equal(chromaKeyAlpha(sCb, sCr, kCb, kCr, 0.4, 0.1), 1)

// Monotonic soft edge: alpha never decreases as a pixel moves away from the key color.
let prev = -1
for (let g = 255; g >= 0; g -= 15) {
  const [cb, cr] = rgbToCbCr(40, g, 40) // fade green out
  const a = chromaKeyAlpha(cb, cr, kCb, kCr, 0.4, 0.1)
  assert.ok(a >= prev - 1e-9, `alpha should be monotonic non-decreasing (g=${g})`)
  prev = a
}

// smoothness widens the ramp: a mid-distance pixel is more transparent with a wider soft edge.
const midCb = kCb + 40, midCr = kCr + 40
const tight = chromaKeyAlpha(midCb, midCr, kCb, kCr, 0.4, 0.02)
const wide = chromaKeyAlpha(midCb, midCr, kCb, kCr, 0.4, 0.3)
assert.ok(wide <= tight, 'a wider soft edge keeps a mid-distance pixel more transparent')

console.log('camera-effect.test.ts: all assertions passed')
