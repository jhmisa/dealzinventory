import assert from 'node:assert/strict'
import { sceneIndexOf, sceneFill, SCENE_FILLS } from './scene-colors'

const bounds = [30, 70]

// Before the first boundary → scene 0; from the first boundary → scene 1; etc.
assert.equal(sceneIndexOf(0, bounds), 0)
assert.equal(sceneIndexOf(15, bounds), 0)
assert.equal(sceneIndexOf(30, bounds), 1) // exactly on a boundary counts into the new scene
assert.equal(sceneIndexOf(50, bounds), 1)
assert.equal(sceneIndexOf(70, bounds), 2)
assert.equal(sceneIndexOf(90, bounds), 2)

// No boundaries → everything is scene 0.
assert.equal(sceneIndexOf(42, []), 0)

// Pieces in the same scene share a fill; adjacent scenes differ.
assert.equal(sceneFill(0, bounds), sceneFill(15, bounds))
assert.notEqual(sceneFill(15, bounds), sceneFill(50, bounds))
assert.equal(sceneFill(0, bounds), SCENE_FILLS[0])

console.log('scene-colors.test.ts: all assertions passed')
