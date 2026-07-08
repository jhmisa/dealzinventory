import assert from 'node:assert/strict'
import { computeItemBounds } from './overlay'

// SPACE pressed at 4.2s and 9.8s during a 14s take → item boundaries at those times.
assert.deepEqual(computeItemBounds([4.2, 9.8], 14), [4.2, 9.8])
// out-of-range / duplicate / unsorted taps are dropped; 0 and duration are never bounds
assert.deepEqual(computeItemBounds([0, 4.2, 4.2, 20, 9.8], 14), [4.2, 9.8])
assert.deepEqual(computeItemBounds([], 14), [])

console.log('overlay.test.ts: all assertions passed')
