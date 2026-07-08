import assert from 'node:assert/strict'
import {
  makeTimeline, boundaries, pieces, addSplit, removePiece, restorePiece,
  setTrim, cutTotal, finalLength, keepIntervals, type TimelineState,
} from './timeline'

// duration 100, item boundaries (SPACE taps) at 30 and 70
const base: TimelineState = makeTimeline(100, [30, 70])

// boundaries always include 0 + duration + item bounds, sorted & deduped
assert.deepEqual(boundaries(base), [0, 30, 70, 100])
assert.deepEqual(pieces(base).map((p) => [p.start, p.end]), [[0, 30], [30, 70], [70, 100]])

// no cuts yet → full length
assert.equal(cutTotal(base), 0)
assert.equal(finalLength(base), 100)
assert.deepEqual(keepIntervals(base), [{ start: 0, end: 100 }])

// remove the middle item (30–70): keepIntervals splits around it
const s1 = removePiece(base, { start: 30, end: 70 })
assert.equal(cutTotal(s1), 40)
assert.equal(finalLength(s1), 60)
assert.deepEqual(keepIntervals(s1), [{ start: 0, end: 30 }, { start: 70, end: 100 }])

// a user split at 50 then remove 30–50 only
assert.deepEqual(boundaries(addSplit(base, 50)), [0, 30, 50, 70, 100])
const s2 = removePiece(addSplit(base, 50), { start: 30, end: 50 })
assert.equal(finalLength(s2), 80)
assert.deepEqual(keepIntervals(s2), [{ start: 0, end: 30 }, { start: 50, end: 100 }])

// addSplit ignores near-duplicate / near-boundary / out-of-range taps (0.2s epsilon)
assert.deepEqual(addSplit(base, 30.1).userSplits, []) // too close to item bound 30
assert.deepEqual(addSplit(base, 0).userSplits, [])     // at start
assert.deepEqual(addSplit(base, 100).userSplits, [])   // at end

// restorePiece reverses a removal
assert.deepEqual(keepIntervals(restorePiece(s1, { start: 30, end: 70 })), [{ start: 0, end: 100 }])

// trim handles shrink the kept window and drop the parts of removed ranges outside it
const s3 = setTrim(s1, 10, 90) // trim 0–10 and 90–100, on top of the 30–70 cut
assert.deepEqual(keepIntervals(s3), [{ start: 10, end: 30 }, { start: 70, end: 90 }])
assert.equal(finalLength(s3), 40)

console.log('timeline.test.ts: all assertions passed')
