import assert from 'node:assert/strict'
import { regionsFor, retakeBounds } from './layout-presets'
import { ORIENTATION_DIMS } from './types'

function inCanvas(rect: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  return rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= W && rect.y + rect.h <= H
}

for (const orientation of ['portrait', 'landscape'] as const) {
  const dims = ORIENTATION_DIMS[orientation]
  for (const preset of ['talking-head', 'specs-inset', 'product-showcase'] as const) {
    const reg = regionsFor(orientation, preset)
    assert.ok(inCanvas(reg.product, dims.canvasW, dims.canvasH), `${orientation}/${preset} product in-canvas`)
    assert.ok(inCanvas(reg.specs, dims.canvasW, dims.canvasH), `${orientation}/${preset} specs in-canvas`)
    assert.ok(inCanvas(reg.cameraBox, dims.canvasW, dims.canvasH), `${orientation}/${preset} camera in-canvas`)
  }
}

// product-showcase reproduces the protected showcase geometry exactly.
const showcase = regionsFor('portrait', 'product-showcase')
assert.deepEqual(showcase.product, ORIENTATION_DIMS.portrait.product)
assert.deepEqual(showcase.cameraBox, ORIENTATION_DIMS.portrait.camera)
assert.equal(showcase.cameraBehind, false)

// talking-head is camera-dominant (behind) and distinct from showcase.
const talking = regionsFor('portrait', 'talking-head')
assert.equal(talking.cameraBehind, true)
assert.notDeepEqual(talking.cameraBox, showcase.cameraBox)

// specs-inset differs again.
const inset = regionsFor('portrait', 'specs-inset')
assert.notDeepEqual(inset.product, showcase.product)

// retakeBounds: keep earlier scenes, drop current onward, rewind to current scene start.
assert.deepEqual(retakeBounds([10, 25, 40], 2), { keepBounds: [10, 25], rewindToSec: 25 })
assert.deepEqual(retakeBounds([10, 25, 40], 0), { keepBounds: [], rewindToSec: 0 })
assert.deepEqual(retakeBounds([10, 25, 40], 3), { keepBounds: [10, 25, 40], rewindToSec: 40 })

console.log('layout-presets.test.ts: all assertions passed')
